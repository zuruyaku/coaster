// Apps Script Web APIとの通信をまとめたモジュール

const Api = {
  async fetchEvents() {
    if (!APPS_SCRIPT_URL) {
      throw new Error("APPS_SCRIPT_URLが設定されていません。js/config.jsを確認してください。");
    }
    const res = await fetch(`${APPS_SCRIPT_URL}?action=events`);
    if (!res.ok) throw new Error("イベント情報の取得に失敗しました。");
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "イベント情報の取得に失敗しました。");
    return data.events;
  },

  async fetchEvent(eventId) {
    const events = await this.fetchEvents();
    const event = events.find((e) => e.id === eventId);
    if (!event) throw new Error("指定されたイベントが見つかりませんでした。");
    return event;
  },

  async submitReservation(payload) {
    if (!APPS_SCRIPT_URL) {
      throw new Error("APPS_SCRIPT_URLが設定されていません。js/config.jsを確認してください。");
    }
    // Content-Typeをtext/plainにすることでブラウザのpreflight(OPTIONS)を回避する
    // (Apps Script Web AppはOPTIONSリクエストに対応していないため)
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "reserve", ...payload }),
    });
    if (!res.ok) throw new Error("予約リクエストの送信に失敗しました。");
    return res.json();
  },
};
