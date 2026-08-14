function getEventIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
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

function renderEventDetail(event) {
  const container = document.getElementById("event-detail");
  const percent = event.capacity > 0 ? Math.min(100, Math.round((event.reserved / event.capacity) * 100)) : 0;
  const soldOut = event.remaining <= 0;
  const image = event.imageUrl
    ? `<img class="event-detail__image" src="${event.imageUrl}" alt="${event.title}" />`
    : "";

  container.innerHTML = `
    <article class="event-detail">
      ${image}
      <div class="event-detail__body">
        <h1 class="event-detail__title">${event.title}</h1>
        <ul class="info-list">
          <li><strong>日時</strong>${formatDate(event.date, event.time)}</li>
          <li><strong>会場</strong>${event.venue || "-"}</li>
          <li><strong>定員</strong>${event.capacity}名</li>
        </ul>
        <p>${(event.description || "").replace(/\n/g, "<br>")}</p>

        <div class="capacity-box">
          ${soldOut ? "満席のため、現在予約を受け付けていません。" : `残り ${event.remaining} 名 / 定員 ${event.capacity}名`}
          <div class="progress-bar"><div class="progress-bar__fill" style="width:${percent}%"></div></div>
        </div>

        <form class="reservation-form" id="reservation-form">
          <div class="field">
            <label for="name">お名前 <span aria-hidden="true">*</span></label>
            <input type="text" id="name" name="name" required maxlength="80" />
          </div>
          <div class="field">
            <label for="email">メールアドレス <span aria-hidden="true">*</span></label>
            <input type="email" id="email" name="email" required maxlength="120" />
          </div>
          <div class="field">
            <label for="phone">電話番号</label>
            <input type="tel" id="phone" name="phone" maxlength="20" />
          </div>
          <div class="field">
            <label for="partySize">参加人数 <span aria-hidden="true">*</span></label>
            <input type="number" id="partySize" name="partySize" min="1" max="${Math.max(1, event.remaining)}" value="1" required />
            <small>残り${event.remaining}名まで予約できます。</small>
          </div>
          <button type="submit" class="submit-btn" ${soldOut ? "disabled" : ""}>
            ${soldOut ? "満席" : "予約する"}
          </button>
          <div id="form-message"></div>
        </form>
      </div>
    </article>
  `;

  if (!soldOut) {
    document.getElementById("reservation-form").addEventListener("submit", (e) => onSubmit(e, event.id));
  }
}

async function onSubmit(e, eventId) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector(".submit-btn");
  const messageBox = document.getElementById("form-message");
  messageBox.innerHTML = "";

  const payload = {
    eventId,
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    partySize: Number(form.partySize.value),
  };

  submitBtn.disabled = true;
  submitBtn.textContent = "送信中...";

  try {
    const result = await Api.submitReservation(payload);
    if (!result.success) {
      throw new Error(result.error === "capacity_exceeded" ? "申し訳ございません、満席のため予約できませんでした。" : (result.message || "予約に失敗しました。"));
    }
    messageBox.innerHTML = `<div class="message-box message-box--success">予約が完了しました。確認のご連絡をお待ちください。</div>`;
    form.reset();
    submitBtn.textContent = "予約完了";
    // 定員に達した場合に備えて最新状態を再取得
    const refreshed = await Api.fetchEvent(eventId);
    renderEventDetail(refreshed);
  } catch (err) {
    messageBox.innerHTML = `<div class="message-box message-box--error">${err.message}</div>`;
    submitBtn.disabled = false;
    submitBtn.textContent = "予約する";
  }
}

(async function init() {
  const container = document.getElementById("event-detail");
  const eventId = getEventIdFromUrl();
  if (!eventId) {
    container.innerHTML = '<p class="empty-state">イベントが指定されていません。</p>';
    return;
  }
  try {
    const event = await Api.fetchEvent(eventId);
    renderEventDetail(event);
  } catch (err) {
    container.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
})();
