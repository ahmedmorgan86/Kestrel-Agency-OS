import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Check, Plus, Users, Video, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import {
  ErrorBanner,
  Modal,
  PageHeader,
  PRIMARY_BTN,
  SECONDARY_BTN,
  SectionCard,
} from '../components/ui';

interface HqEmployee {
  id: string;
  full_name: string;
  job_title: string;
  department_name?: string | null;
}

interface HqRoom {
  id: string;
  name: string;
  capacity: number;
  description: string;
}

interface HqMeeting {
  id: string;
  title: string;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  room_id: string;
  room_name: string;
  started_at?: string | null;
  ended_at?: string | null;
  participant_count?: number;
}

const STATUS_LABEL: Record<HqMeeting['status'], string> = {
  scheduled: 'مجدول',
  active: 'جارٍ الآن',
  completed: 'انتهى',
  cancelled: 'ملغي',
};

function dateLabel(value?: string | null) {
  if (!value) return 'لم يبدأ بعد';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function MeetingsView({ initialMeetingId = null }: { initialMeetingId?: string | null; onNavigate?: (route: string) => void }) {
  const [rooms, setRooms] = useState<HqRoom[]>([]);
  const [meetings, setMeetings] = useState<HqMeeting[]>([]);
  const [employees, setEmployees] = useState<HqEmployee[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialMeetingId);
  const [participants, setParticipants] = useState<Array<Record<string, any>>>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [roomId, setRoomId] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [meetingData, hq] = await Promise.all([
      apiRequest<{ rooms: HqRoom[]; meetings: HqMeeting[] }>('/meetings'),
      apiRequest<{ humans: HqEmployee[] }>('/hq/state'),
    ]);
    setRooms(meetingData.rooms);
    setMeetings(meetingData.meetings);
    setEmployees(hq.humans);
    setRoomId((current) => current || meetingData.rooms[0]?.id || '');
    setSelectedId((current) => current || meetingData.meetings.find((item) => item.status === 'active')?.id || null);
  }, []);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'تعذّر تحميل الاجتماعات.'));
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setParticipants([]);
      return;
    }
    void apiRequest<{ participants: Array<Record<string, any>> }>(`/meetings/${selectedId}`)
      .then((result) => setParticipants(result.participants))
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذّر تحميل الحضور.'));
  }, [selectedId]);

  const toggleEmployee = (employeeId: string) => {
    setSelectedEmployeeIds((current) => current.includes(employeeId)
      ? current.filter((id) => id !== employeeId)
      : current.length >= 8 ? current : [...current, employeeId]);
  };

  const createMeeting = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<{ meeting: { id: string } }>('/meetings', {
        method: 'POST',
        body: { title, roomId, humanParticipantIds: selectedEmployeeIds },
      });
      setTitle('');
      setSelectedEmployeeIds([]);
      setCreateOpen(false);
      setNotice('بدأ الاجتماع. سيتجه الحضور إلى مقاعدهم في مقر الشركة.');
      setSelectedId(result.meeting.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر بدء الاجتماع.');
    } finally {
      setBusy(false);
    }
  };

  const endMeeting = async (meetingId: string) => {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/meetings/${meetingId}`, { method: 'PATCH', body: { status: 'completed' } });
      setNotice('انتهى الاجتماع وعاد الحضور إلى مكاتبهم.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر إنهاء الاجتماع.');
    } finally {
      setBusy(false);
    }
  };

  const selectedMeeting = meetings.find((meeting) => meeting.id === selectedId) ?? null;
  const selectedRoom = rooms.find((room) => room.id === roomId);

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="اجتماعات فريق MORGAN GROUP"
        subtitle="أنشئ اجتماعاً داخلياً؛ وسينتقل الحضور المسجّل إلى مقاعدهم في مقر الشركة ثلاثي الأبعاد."
        actions={<button type="button" className={PRIMARY_BTN} onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> اجتماع جديد</button>}
      />
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}<button className="mr-3 underline" onClick={() => setNotice(null)}>إغلاق</button></div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.82fr)]">
        <SectionCard title="سجل الاجتماعات" description="الاجتماعات الحالية والسابقة على حسابك الخاص" noPadding>
          {meetings.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">لا توجد اجتماعات بعد. ابدأ أول اجتماع لفريقك.</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {meetings.map((meeting) => (
                <button key={meeting.id} type="button" onClick={() => setSelectedId(meeting.id)} className={`flex w-full items-start justify-between gap-4 p-4 text-right hover:bg-slate-50 dark:hover:bg-slate-800/40 ${selectedId === meeting.id ? 'bg-blue-50/70 dark:bg-blue-950/20' : ''}`}>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-900 dark:text-white">{meeting.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">{meeting.room_name} · {dateLabel(meeting.started_at)}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${meeting.status === 'active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {STATUS_LABEL[meeting.status]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={selectedMeeting?.title || 'تفاصيل الاجتماع'}
          description={selectedMeeting ? `${selectedMeeting.room_name} · ${dateLabel(selectedMeeting.started_at)}` : 'اختر اجتماعاً من السجل'}
          right={selectedMeeting?.status === 'active' ? <button type="button" className={SECONDARY_BTN} disabled={busy} onClick={() => void endMeeting(selectedMeeting.id)}><X className="h-4 w-4" /> إنهاء الاجتماع</button> : undefined}
        >
          {selectedMeeting ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-950/50">
                <CalendarClock className="h-5 w-5 text-blue-600" />
                <div><div className="text-sm font-medium">{STATUS_LABEL[selectedMeeting.status]}</div><div className="text-xs text-slate-500">عدد الحضور: {selectedMeeting.participant_count ?? participants.length}</div></div>
              </div>
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" /> الحضور المسجّل</h3>
                {participants.length ? <div className="space-y-2">{participants.map((person) => <div key={person.id} className="flex items-center justify-between rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800"><span className="font-medium">{person.name}</span><span className="text-xs text-slate-500">{person.job_title}</span></div>)}</div> : <p className="text-sm text-slate-500">لا يوجد حضور مسجّل لهذا الاجتماع.</p>}
              </div>
            </div>
          ) : <p className="text-sm text-slate-500">تفاصيل الاجتماع والحضور تظهر هنا.</p>}
        </SectionCard>
      </div>

      <SectionCard title="غرف الاجتماعات" description="تُستخدم الغرف نفسها في المشهد ثلاثي الأبعاد.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rooms.map((room) => <div key={room.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"><div className="flex items-center gap-2 font-semibold"><Video className="h-4 w-4 text-indigo-500" /> {room.name}</div><p className="mt-2 text-xs text-slate-500">{room.description}</p><p className="mt-3 text-xs text-slate-500">السعة: {room.capacity} أشخاص</p></div>)}
        </div>
      </SectionCard>

      <Modal open={createOpen} title="بدء اجتماع داخلي" onClose={() => setCreateOpen(false)} maxWidth="max-w-2xl">
        <form className="space-y-4 overflow-y-auto p-5" onSubmit={(event) => void createMeeting(event)}>
          <label className="block space-y-1.5"><span className="text-sm font-medium">عنوان الاجتماع</span><input required minLength={2} maxLength={140} value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="مثال: مراجعة خطة منشورات الأسبوع" /></label>
          <label className="block space-y-1.5"><span className="text-sm font-medium">الغرفة</span><select required value={roomId} onChange={(event) => setRoomId(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">{rooms.map((room) => <option key={room.id} value={room.id}>{room.name} · سعة {room.capacity}</option>)}</select></label>
          <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-sm font-medium">المشاركون</span><span className="text-xs text-slate-500">{selectedEmployeeIds.length}/{selectedRoom?.capacity ?? 0}</span></div><div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2 dark:border-slate-800">{employees.map((employee) => {const checked = selectedEmployeeIds.includes(employee.id); const disabled = !checked && (selectedEmployeeIds.length >= 8 || selectedEmployeeIds.length >= Number(selectedRoom?.capacity ?? 0)); return <label key={employee.id} className={`flex cursor-pointer items-start gap-3 rounded-md px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 ${disabled ? 'opacity-45' : ''}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleEmployee(employee.id)} className="mt-1" /><span><span className="block text-sm font-medium">{employee.full_name}</span><span className="text-xs text-slate-500">{employee.job_title} · {employee.department_name}</span></span></label>;})}</div><p className="text-xs text-slate-500">اختر من موظف إلى {selectedRoom?.capacity ?? 8} موظفين. عند بدء الاجتماع ينتقلون إلى مقاعد الغرفة.</p></div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800"><button type="button" className={SECONDARY_BTN} onClick={() => setCreateOpen(false)}>إلغاء</button><button type="submit" disabled={busy || !selectedEmployeeIds.length || !title.trim() || !roomId} className={PRIMARY_BTN}><Check className="h-4 w-4" /> {busy ? 'جارٍ البدء…' : 'بدء الاجتماع الآن'}</button></div>
        </form>
      </Modal>
    </div>
  );
}
