function capacityBadge(event) {
  const remaining = event.remaining;
  if (remaining <= 0) return { text: "満席", cls: "badge--full" };
  if (remaining <= Math.max(1, Math.ceil(event.capacity * 0.2)))
    return { text: `残りわずか (${remaining}名)`, cls: "badge--few" };
  return { text: `予約受付中 (残り${remaining}名)`, cls: "badge--open" };
}

function formatDate(dateStr, timeStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return `${dateStr} ${timeStr || ""}`.trim();
  const formatted = d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  return timeStr ? `${formatted} ${timeStr}` : formatted;
}

function renderEvents(events) {
  const container = document.getElementById("event-list");
  if (!events.length) {
    container.innerHTML = '<p class="empty-state">現在開催予定のイベントはありません。</p>';
    return;
  }

  container.innerHTML = events
    .map((event) => {
      const badge = capacityBadge(event);
      const image = event.imageUrl
        ? `<img class="event-card__image" src="${event.imageUrl}" alt="${event.title}" />`
        : "";
      return `
        <a class="event-card" href="event.html?id=${encodeURIComponent(event.id)}">
          ${image}
          <div class="event-card__body">
            <span class="badge ${badge.cls}">${badge.text}</span>
            <span class="event-card__title">${event.title}</span>
            <span class="event-card__meta">${formatDate(event.date, event.time)}</span>
            <span class="event-card__meta">${event.venue || ""}</span>
          </div>
        </a>
      `;
    })
    .join("");
}

(async function init() {
  const container = document.getElementById("event-list");
  try {
    const events = await Api.fetchEvents();
    renderEvents(events);
  } catch (err) {
    container.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
})();
