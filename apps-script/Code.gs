/**
 * イベント予約システム バックエンド (Google Apps Script)
 *
 * 使い方:
 * 1. Googleスプレッドシートを新規作成する
 * 2. 「拡張機能」>「Apps Script」を開き、このファイルの内容を貼り付ける
 * 3. 関数 initializeSheets を一度実行し、シートとヘッダー・サンプルイベントを作成する
 * 4. 「デプロイ」>「新しいデプロイ」>種類「ウェブアプリ」
 *    - 実行するユーザー: 自分
 *    - アクセスできるユーザー: 全員
 * 5. 発行されたウェブアプリURLを、フロントエンドの js/config.js の APPS_SCRIPT_URL に設定する
 */

const EVENTS_SHEET_NAME = "Events";
const RESERVATIONS_SHEET_NAME = "Reservations";
const ORGANIZER_EMAIL = "info@yomitanhanaori.com";
const SENDER_NAME = "読谷山花織 予約受付";

const EVENTS_HEADERS = ["id", "title", "date", "time", "venue", "description", "imageUrl", "capacity"];
const RESERVATIONS_HEADERS = ["timestamp", "eventId", "name", "email", "phone", "partySize", "status"];

function initializeSheets() {
  const ss = SpreadsheetApp.getActive();

  let eventsSheet = ss.getSheetByName(EVENTS_SHEET_NAME);
  if (!eventsSheet) {
    eventsSheet = ss.insertSheet(EVENTS_SHEET_NAME);
  }
  if (eventsSheet.getLastRow() === 0) {
    eventsSheet.appendRow(EVENTS_HEADERS);
    const seedRows = buildSeedEvents();
    eventsSheet.getRange(2, 1, seedRows.length, EVENTS_HEADERS.length).setValues(seedRows);
  }

  let reservationsSheet = ss.getSheetByName(RESERVATIONS_SHEET_NAME);
  if (!reservationsSheet) {
    reservationsSheet = ss.insertSheet(RESERVATIONS_SHEET_NAME);
  }
  if (reservationsSheet.getLastRow() === 0) {
    reservationsSheet.appendRow(RESERVATIONS_HEADERS);
  }
}

function buildSeedEvents() {
  const dates = ["2026-09-11", "2026-09-12", "2026-09-13"];
  const hours = [10, 11, 12, 13, 14, 15, 16];
  const title = "読谷山花織 機織り体験（コースター作成）";
  const venue = "時事通信ホール（沖縄工芸フェア内）";
  const description =
    "沖縄工芸フェアの一企画。読谷山花織の機（はた）を実際に使い、コースターを1枚作成する体験です。1枠1組の完全予約制です。";
  const capacity = 1;

  const rows = [];
  dates.forEach((date) => {
    const md = date.slice(5, 7) + date.slice(8, 10);
    hours.forEach((h) => {
      const hh = (h < 10 ? "0" : "") + h;
      const time = hh + ":00";
      const id = `coaster-${md}-${hh}`;
      rows.push([id, title, date, time, venue, description, "", capacity]);
    });
  });
  return rows;
}

function doGet(e) {
  const action = e.parameter.action;
  if (action === "events") {
    return jsonOutput({ success: true, events: getEventsWithAvailability() });
  }
  return jsonOutput({ success: false, error: "unknown_action" });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput({ success: false, error: "invalid_request" });
  }

  if (body.action === "reserve") {
    return handleReservation(body);
  }
  return jsonOutput({ success: false, error: "unknown_action" });
}

function handleReservation(body) {
  const eventId = String(body.eventId || "").trim();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const phone = String(body.phone || "").trim();
  const partySize = Number(body.partySize);

  if (!eventId || !name || !email || !partySize || partySize < 1) {
    return jsonOutput({ success: false, error: "invalid_request", message: "入力内容に不備があります。" });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const event = getEventById(eventId);
    if (!event) {
      return jsonOutput({ success: false, error: "not_found", message: "イベントが見つかりません。" });
    }

    const reserved = getReservedCount(eventId);
    const remaining = event.capacity - reserved;

    if (partySize > remaining) {
      return jsonOutput({
        success: false,
        error: "capacity_exceeded",
        message: `満席のため予約できませんでした（残り${Math.max(0, remaining)}名）。`,
      });
    }

    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(RESERVATIONS_SHEET_NAME);
    sheet.appendRow([new Date(), eventId, name, email, phone, partySize, "confirmed"]);

    sendReservationEmails(event, { name, email, phone, partySize });

    return jsonOutput({ success: true });
  } finally {
    lock.releaseLock();
  }
}

// 予約確定時に、主催者への通知メールと予約者への確認メールを送る。
// メール送信の失敗が予約自体の成否に影響しないよう、それぞれ個別にtry/catchする。
function sendReservationEmails(event, reservation) {
  const eventLabel = `${event.title}（${event.date} ${event.time}）`;

  try {
    MailApp.sendEmail({
      to: ORGANIZER_EMAIL,
      subject: `【新規予約】${eventLabel}`,
      name: SENDER_NAME,
      noReply: true,
      body: [
        "新しい予約が入りました。",
        "",
        `イベント: ${event.title}`,
        `日時: ${event.date} ${event.time}`,
        `会場: ${event.venue}`,
        "",
        `お名前: ${reservation.name}`,
        `メール: ${reservation.email}`,
        `電話番号: ${reservation.phone || "(未入力)"}`,
        `参加人数: ${reservation.partySize}名`,
      ].join("\n"),
    });
  } catch (err) {
    // 通知メールの失敗は無視する（予約データ自体はスプレッドシートに保存済み）
  }

  try {
    MailApp.sendEmail({
      to: reservation.email,
      subject: `【予約完了】${eventLabel}`,
      name: SENDER_NAME,
      noReply: true,
      body: [
        `${reservation.name} 様`,
        "",
        "以下の内容でご予約を承りました。",
        "",
        `イベント: ${event.title}`,
        `日時: ${event.date} ${event.time}`,
        `会場: ${event.venue}`,
        `参加人数: ${reservation.partySize}名`,
        "",
        "当日はお気をつけてお越しください。",
        "※このメールは送信専用です。返信いただいても対応できません。",
      ].join("\n"),
    });
  } catch (err) {
    // 確認メールの失敗は無視する（予約データ自体はスプレッドシートに保存済み）
  }
}

function getEventsWithAvailability() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(EVENTS_SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const events = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;
    const event = rowToObject(headers, row);
    event.date = formatDateValue(event.date);
    event.time = formatTimeValue(event.time);
    event.capacity = Number(event.capacity) || 0;
    event.reserved = getReservedCount(event.id);
    event.remaining = Math.max(0, event.capacity - event.reserved);
    events.push(event);
  }

  return events;
}

// スプレッドシートが日付/時刻として自動認識した値を、扱いやすい文字列に正規化する
function formatDateValue(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return value;
}

function formatTimeValue(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm");
  }
  return value;
}

function getEventById(eventId) {
  return getEventsWithAvailability().find((ev) => ev.id === eventId) || null;
}

function getReservedCount(eventId) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(RESERVATIONS_SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idxEventId = headers.indexOf("eventId");
  const idxPartySize = headers.indexOf("partySize");
  const idxStatus = headers.indexOf("status");

  let total = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[idxEventId] === eventId && row[idxStatus] === "confirmed") {
      total += Number(row[idxPartySize]) || 0;
    }
  }
  return total;
}

function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((key, i) => {
    obj[key] = row[i];
  });
  return obj;
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 「まとめ」シートに、枠ごとの予約状況（定員・予約人数・残り・状況・予約者名）を集計する。
// スプレッドシートの数式で組んでいるため、一度実行すればあとは自動で最新状態に更新される。
// Eventsシートに行を追加した場合は、まとめ表に反映させるためもう一度このシートの機能を実行し直す。
function buildSummarySheet() {
  const ss = SpreadsheetApp.getActive();
  const eventsSheet = ss.getSheetByName(EVENTS_SHEET_NAME);
  const lastRow = eventsSheet.getLastRow();

  let sheet = ss.getSheetByName("まとめ");
  if (sheet) {
    sheet.clear();
    sheet.clearConditionalFormatRules();
  } else {
    sheet = ss.insertSheet("まとめ");
  }

  const headers = ["日付", "時間", "タイトル", "会場", "定員", "予約人数", "残り", "状況", "予約者"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  sheet.setFrozenRows(1);

  if (lastRow < 2) return;

  const dataRowCount = lastRow - 1;
  const rows = [];
  for (let r = 2; r <= lastRow; r++) {
    rows.push([
      `=TEXT(Events!C${r},"yyyy-mm-dd")`,
      `=TEXT(Events!D${r},"hh:mm")`,
      `=Events!B${r}`,
      `=Events!E${r}`,
      `=Events!H${r}`,
      `=SUMIFS(Reservations!F:F,Reservations!B:B,Events!A${r},Reservations!G:G,"confirmed")`,
      `=E${r}-F${r}`,
      `=IF(G${r}<=0,"満席",IF(G${r}<=CEILING(E${r}*0.2,1),"残りわずか","受付中"))`,
      `=ARRAYFORMULA(TEXTJOIN(", ",TRUE,IF((Reservations!$B$2:$B$1000=Events!A${r})*(Reservations!$G$2:$G$1000="confirmed"),Reservations!$C$2:$C$1000,"")))`,
    ]);
  }

  sheet.getRange(2, 1, dataRowCount, headers.length).setFormulas(rows);
  sheet.autoResizeColumns(1, headers.length);

  const statusRange = sheet.getRange(2, 8, dataRowCount, 1);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("満席")
      .setBackground("#f8e6e5")
      .setRanges([statusRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("残りわずか")
      .setBackground("#fdf1de")
      .setRanges([statusRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("受付中")
      .setBackground("#e6f1e8")
      .setRanges([statusRange])
      .build(),
  ]);
}
