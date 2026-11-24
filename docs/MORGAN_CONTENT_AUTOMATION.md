# MORGAN GROUP content automation

The private production queue is stored in Neon. A Vercel API request creates a run and assigns a task-sized team of the 30 fictional AI colleagues. The local worker searches recent public Arabic news sources, then runs separate Arabic strategy, writing, creative, specialist, and quality stages through Ollama. Each stage is saved to the run's task record before the next starts.

## Review and publishing gate

- A run is available for owner review only after all production stages finish.
- The owner decision is tied to a hash of the completed content package and stored with the reviewer, timestamp, and comments.
- Requesting changes creates a new run with the owner's note and a fresh team assignment.
- Accepting a run records acceptance only. It does not publish or schedule anything to an external platform.
- If the internal quality stage flags material issues, acceptance is blocked; the owner may request a new production round.

## Recovery and honest readiness

The worker claims a run with a ten-minute database lease and renews it while processing. An interrupted run is reclaimed from the research stage, with partial task outputs cleared. After three interrupted attempts, the run is marked failed and its unfinished tasks are closed; the owner can explicitly retry it when the worker is healthy.

The current search source is Google News' public Arabic RSS feed, filtered to recent items and linked to each source. These are current news-topic signals, not official TikTok, Instagram, YouTube, or Facebook trend measurements. The app must show the worker as unavailable and keep production disabled if Neon, Ollama, or the configured free local model is unavailable.

## Free local operation

The Ollama worker must run on an online computer with the selected model installed and access to the same isolated Neon branch used by the Vercel preview. Keep `DATABASE_URL` in an untracked local environment file; do not add it to the browser build or Git. The local machine and worker must remain online for a run to finish. The software does not claim to keep producing while that worker is off.
