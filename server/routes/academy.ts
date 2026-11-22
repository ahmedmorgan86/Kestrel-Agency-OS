import { Router } from 'express';
import { z } from 'zod';
import { getDb, nowIso } from '../db/database';
import { DEFAULT_ORG_ID } from '../db/seed';
import { requireAuth, requirePermission, type AuthedRequest } from '../services/auth';
import { generateId } from '../services/security';
import { writeAuditLog } from '../services/audit';

export const academyRouter = Router();

academyRouter.get('/academy', requireAuth, (_req, res) => {
  const db = getDb();
  const courses = db.prepare(`
    SELECT c.id, c.code, c.title, c.description, c.curriculum_json, c.sort_order,
           (SELECT COUNT(*) FROM academy_enrollments e WHERE e.course_id = c.id) AS enrollment_count,
           (SELECT COUNT(*) FROM academy_enrollments e WHERE e.course_id = c.id AND e.status = 'completed') AS completion_count
    FROM academy_courses c
    WHERE c.organization_id = ? AND c.status = 'active'
    ORDER BY c.sort_order, c.title
  `).all(DEFAULT_ORG_ID) as Array<Record<string, unknown>>;
  const enrollments = db.prepare(`
    SELECT e.id, e.course_id, e.employee_id, e.progress_percent, e.status,
           e.enrolled_at, e.completed_at, e.updated_at, p.full_name, p.job_title,
           d.name AS department_name, c.title AS course_title
    FROM academy_enrollments e
    INNER JOIN employees p ON p.id = e.employee_id
    INNER JOIN academy_courses c ON c.id = e.course_id
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE e.organization_id = ?
    ORDER BY e.updated_at DESC
  `).all(DEFAULT_ORG_ID);
  const employees = db.prepare(`
    SELECT e.id, e.full_name, e.job_title, d.name AS department_name
    FROM employees e LEFT JOIN departments d ON d.id = e.department_id
    WHERE e.organization_id = ? AND e.employment_status = 'active' AND e.id LIKE 'employee_virtual_%'
    ORDER BY e.full_name
  `).all(DEFAULT_ORG_ID);

  res.json({
    courses: courses.map((course) => ({
      ...course,
      lessons: JSON.parse(String(course.curriculum_json || '[]')),
      enrollment_count: Number(course.enrollment_count || 0),
      completion_count: Number(course.completion_count || 0),
    })),
    enrollments,
    employees,
  });
});

academyRouter.post('/academy/:courseId/enrollments', requirePermission('users:manage'), (req: AuthedRequest, res) => {
  const parsed = z.object({ employeeId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Choose an employee to enroll.' });
    return;
  }
  const db = getDb();
  const course = db.prepare(`SELECT id, title FROM academy_courses WHERE id = ? AND organization_id = ? AND status = 'active'`)
    .get(req.params.courseId, DEFAULT_ORG_ID) as { id: string; title: string } | undefined;
  const employee = db.prepare(`SELECT id, full_name FROM employees WHERE id = ? AND organization_id = ? AND employment_status = 'active'`)
    .get(parsed.data.employeeId, DEFAULT_ORG_ID) as { id: string; full_name: string } | undefined;
  if (!course || !employee) {
    res.status(404).json({ error: 'The course or employee could not be found.' });
    return;
  }

  const ts = nowIso();
  const enrollmentId = generateId('enrollment');
  db.prepare(`
    INSERT INTO academy_enrollments (id, organization_id, course_id, employee_id, enrolled_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(course_id, employee_id) DO NOTHING
  `).run(enrollmentId, DEFAULT_ORG_ID, course.id, employee.id, ts, ts);
  const enrollment = db.prepare(`SELECT * FROM academy_enrollments WHERE course_id = ? AND employee_id = ?`)
    .get(course.id, employee.id);

  if (enrollment && (enrollment as Record<string, unknown>).id === enrollmentId) {
    writeAuditLog({
      db,
      correlationId: req.correlationId,
      actorType: 'human',
      actorId: req.authUser!.id,
      actorLabel: req.authUser!.email,
      action: 'academy.employee_enrolled',
      entityType: 'academy_enrollment',
      entityId: enrollmentId,
      metadata: { employeeId: employee.id, courseId: course.id, courseTitle: course.title },
    });
  }
  res.status(201).json({ enrollment });
});

academyRouter.patch('/academy/enrollments/:enrollmentId', requirePermission('users:manage'), (req: AuthedRequest, res) => {
  const parsed = z.object({ progressPercent: z.number().int().min(0).max(100) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Progress must be a whole number from 0 to 100.' });
    return;
  }
  const db = getDb();
  const existing = db.prepare(`
    SELECT id, progress_percent, status FROM academy_enrollments
    WHERE id = ? AND organization_id = ?
  `).get(req.params.enrollmentId, DEFAULT_ORG_ID) as { id: string; progress_percent: number; status: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Enrollment not found.' });
    return;
  }

  const progress = parsed.data.progressPercent;
  const status = progress === 100 ? 'completed' : progress > 0 ? 'in_progress' : 'enrolled';
  const completedAt = progress === 100 ? nowIso() : null;
  db.prepare(`
    UPDATE academy_enrollments
    SET progress_percent = ?, status = ?, completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(progress, status, completedAt, nowIso(), existing.id);

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'academy.progress_updated',
    entityType: 'academy_enrollment',
    entityId: existing.id,
    metadata: { previousProgress: existing.progress_percent, progressPercent: progress, status },
  });
  res.json({ enrollment: db.prepare('SELECT * FROM academy_enrollments WHERE id = ?').get(existing.id) });
});
