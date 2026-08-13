(() => {
  const STORAGE_KEY = "jackrabbit.chart.v6";
  const MAX_MEDS = 8;
  const MAX_REFS = 8;
  const MAX_DX = 12;
  const HISTORY_RANGES = [
    { id: "90d", label: "90 days", days: 90 },
    { id: "3m", label: "3 months", days: 92 },
    { id: "6m", label: "6 months", days: 183 },
    { id: "1y", label: "1 year", days: 365 },
    { id: "2y", label: "2 years", days: 730 },
  ];

  const REQUIRED_FIELDS = [
    "firstName",
    "lastName",
    "dob",
    "sex",
    "phone",
    "payerName",
    "memberId",
  ];

  const PATIENT_FIELDS = [
    "firstName",
    "middleName",
    "lastName",
    "dob",
    "sex",
    "phone",
    "email",
    "address",
    "city",
    "state",
    "zip",
    "mrn",
    "emergencyName",
    "emergencyPhone",
    "insuranceType",
    "payerName",
    "memberId",
    "groupNumber",
    "relationship",
    "subscriberName",
    "subscriberDob",
    "subscriberAddress",
  ];

  const CHECK_FIELDS = [
    "employmentRelated",
    "autoAccident",
    "otherAccident",
    "signatureOnFile",
  ];

  const state = {
    patients: [],
    currentId: null,
    role: "staff",
    dirty: false,
    savedAt: null,
    collapsed: {
      identity: false,
      coverage: false,
      meds: false,
      referrals: false,
      dx: false,
      notes: false,
    },
    more: { identity: false },
    medHistoryOpen: false,
    medHistoryRange: "90d",
    refHistoryOpen: false,
    refHistoryRange: "90d",
    pendingMedCancel: null,
    pendingRefCancel: null,
    unsavedMedIds: new Set(),
    unsavedRefIds: new Set(),
    newDraftId: null,
    newDraftReturnId: null,
    savedById: {},
  };

  const $ = (id) => document.getElementById(id);

  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function emptyPatient() {
    return {
      id: uid("pt"),
      firstName: "",
      middleName: "",
      lastName: "",
      dob: "",
      sex: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      mrn: nextMrn(),
      emergencyName: "",
      emergencyPhone: "",
      insuranceType: "",
      payerName: "",
      memberId: "",
      groupNumber: "",
      relationship: "self",
      subscriberName: "",
      subscriberDob: "",
      subscriberSex: "",
      subscriberAddress: "",
      employmentRelated: false,
      autoAccident: false,
      otherAccident: false,
      signatureOnFile: true,
      inbound: { name: "", npi: "", date: "", specialty: "", practice: "", phone: "", info: "" },
      medications: [],
      medicationHistory: [],
      outbound: [],
      referralHistory: [],
      diagnoses: [],
      notes: "",
      noteHistory: [],
    };
  }

  function nextMrn() {
    const n = 13000 + state.patients.length;
    return `JR-${n}`;
  }

  function current() {
    return state.patients.find((p) => p.id === state.currentId);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.patients = parsed.patients;
        state.currentId = parsed.currentId;
        state.collapsed = { ...state.collapsed, ...parsed.collapsed };
        state.patients.forEach((p) => {
          if (!p.medicationHistory) p.medicationHistory = [];
          if (!p.referralHistory) p.referralHistory = [];
          if (!p.noteHistory) p.noteHistory = [];
          rememberSaved(p);
        });
        return;
      }
    } catch {
      /* use seed */
    }
    state.patients = structuredClone(window.JR_SEED_PATIENTS);
    state.currentId = state.patients[0].id;
    state.patients.forEach(rememberSaved);
  }

  function persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        patients: state.patients,
        currentId: state.currentId,
        collapsed: state.collapsed,
      })
    );
    state.dirty = false;
    state.savedAt = new Date();
    state.unsavedMedIds.clear();
    state.unsavedRefIds.clear();
    document.querySelectorAll(".card.is-new").forEach((el) => el.classList.remove("is-new"));
    if (state.newDraftId && state.currentId === state.newDraftId) {
      state.newDraftId = null;
      state.newDraftReturnId = null;
    }
    highlightRequired([]);
    rememberSaved(current());
    renderSaveMeta();
    applyDraftChrome();
  }

  function rememberSaved(p) {
    if (!p) return;
    state.savedById[p.id] = JSON.stringify(p);
  }

  function isPatientDirty(p) {
    if (!p) return false;
    const snap = state.savedById[p.id];
    if (snap === undefined) return !isBlankDraft(p);
    return JSON.stringify(p) !== snap;
  }

  function markDirty() {
    state.dirty = isPatientDirty(current());
    renderSaveMeta();
  }

  function ageFromDob(dob) {
    if (!dob) return "";
    const d = new Date(`${dob}T00:00:00`);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
    return `${age}y`;
  }

  function displayName(p) {
    const name = [p.lastName, p.firstName].filter(Boolean).join(", ");
    return name || "Untitled patient";
  }

  function fillSelects() {
    const payers = $("payerList");
    payers.innerHTML = window.JR_PAYERS.map((n) => `<option value="${n}"></option>`).join("");
    const types = $("insuranceType");
    types.innerHTML =
      `<option value=""></option>` +
      window.JR_INSURANCE_TYPES.map((n) => `<option value="${n}">${n}</option>`).join("");
  }

  function renderPatientSelect() {
    const sel = $("patientSelect");
    sel.innerHTML = state.patients
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id === state.currentId ? "selected" : ""}>${escapeHtml(
            displayName(p)
          )}${p.mrn ? " · " + p.mrn : ""}</option>`
      )
      .join("");
  }

  function fillForm() {
    const p = current();
    if (!p) return;
    state.medHistoryOpen = false;
    state.refHistoryOpen = false;
    for (const key of PATIENT_FIELDS) {
      const el = document.getElementById(key);
      if (el) el.value = p[key] ?? "";
    }
    for (const key of CHECK_FIELDS) {
      const el = document.getElementById(key);
      if (el) el.checked = Boolean(p[key]);
    }
    $("notes").value = p.notes || "";
    $("ageLabel").textContent = ageFromDob(p.dob);
    renderInbound();
    renderMeds();
    renderRefs();
    renderDx();
    renderNoteHistory();
    renderSummaries();
    renderPatientSelect();
    syncColumnHeights();
  }

  function readScalarFields() {
    const p = current();
    if (!p) return;
    for (const key of PATIENT_FIELDS) {
      const el = document.getElementById(key);
      if (el) p[key] = el.value;
    }
    for (const key of CHECK_FIELDS) {
      const el = document.getElementById(key);
      if (el) p[key] = el.checked;
    }
    p.notes = $("notes").value;
    $("ageLabel").textContent = ageFromDob(p.dob);
    renderSummaries();
    renderPatientSelect();
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function actionOptions(selected) {
    return [
      ["continue", "Continue"],
      ["start", "Start"],
      ["change", "Change"],
      ["stop", "Stop"],
    ]
      .map(([a, label]) => `<option value="${a}" ${a === selected ? "selected" : ""}>${label}</option>`)
      .join("");
  }

  function refStatusOptions(selected) {
    return [
      ["requested", "Requested"],
      ["pending", "Pending"],
      ["authorized", "Authorized"],
      ["scheduled", "Scheduled"],
      ["denied", "Denied"],
    ]
      .map(([a, label]) => `<option value="${a}" ${a === selected ? "selected" : ""}>${label}</option>`)
      .join("");
  }

  function specialtyOptions(selected) {
    return window.JR_SPECIALTIES.map(
      (s) => `<option value="${s}" ${s === selected ? "selected" : ""}>${s}</option>`
    ).join("");
  }

  function renderMeds() {
    const p = current();
    const root = $("medList");
    if (!p.medications.length) {
      root.innerHTML = `<div class="empty">No medications yet. Add up to ${MAX_MEDS}.</div>`;
      applyRole();
      renderMedHistory();
      return;
    }
    root.innerHTML = p.medications
      .map((m) => {
        const isNew = state.unsavedMedIds.has(m.id) ? " is-new" : "";
        return `
      <article class="card med-card${isNew}" data-med="${m.id}">
        <button type="button" class="remove staff-field" data-remove-med="${m.id}" title="${
          state.unsavedMedIds.has(m.id) ? "Cancel" : "Remove"
        }">×</button>
        <div class="card-grid med-top">
          <div class="field">
            <label>Medication</label>
            <input class="staff-field" data-k="name" value="${escapeHtml(m.name)}" />
          </div>
          <div class="field">
            <label>Strength</label>
            <input class="staff-field" data-k="strength" value="${escapeHtml(m.strength)}" />
          </div>
          <div class="field">
            <label>Action</label>
            <select class="staff-field" data-k="action">${actionOptions(m.action)}</select>
          </div>
        </div>
        <div class="field med-directions">
          <label>Directions</label>
          <input class="staff-field" data-k="directions" value="${escapeHtml(m.directions)}" />
        </div>
      </article>`;
      })
      .join("");
    applyRole();
    renderMedHistory();
  }

  function historyCutoff(rangeId) {
    const range = HISTORY_RANGES.find((r) => r.id === rangeId) || HISTORY_RANGES[0];
    const d = new Date();
    d.setDate(d.getDate() - range.days);
    return d;
  }

  function renderMedHistory() {
    const p = current();
    if (!p.medicationHistory) p.medicationHistory = [];
    const open = state.medHistoryOpen;
    $("btnMedHistory").setAttribute("aria-expanded", String(open));
    $("medHistory").hidden = !open;
    if (!open) return;
    $("medHistoryRanges").innerHTML = HISTORY_RANGES.map(
      (r) =>
        `<button type="button" class="staff-field" data-hist-range="${r.id}" aria-pressed="${
          r.id === state.medHistoryRange
        }">${r.label}</button>`
    ).join("");
    const cutoff = historyCutoff(state.medHistoryRange);
    const rows = p.medicationHistory
      .filter((h) => h.stoppedAt && new Date(`${h.stoppedAt}T00:00:00`) >= cutoff)
      .sort((a, b) => (a.stoppedAt < b.stoppedAt ? 1 : -1));
    $("medHistoryList").innerHTML = rows.length
      ? rows
          .map(
            (h) => `
        <div class="history-row">
          <strong>${escapeHtml(h.name)}</strong>
          ${h.strength ? escapeHtml(h.strength) : ""}
          ${h.directions ? ` · ${escapeHtml(h.directions)}` : ""}
          <div class="history-meta">
            Stopped ${escapeHtml(h.stoppedAt)}${h.stopReason ? ` — ${escapeHtml(h.stopReason)}` : ""}
            ${h.physicianApproved ? " · Physician approved" : ""}
          </div>
        </div>`
          )
          .join("")
      : `<div class="empty">No medications stopped in this period.</div>`;
    applyRole();
  }

  function renderRefHistory() {
    const p = current();
    if (!p.referralHistory) p.referralHistory = [];
    const open = state.refHistoryOpen;
    $("btnRefHistory").setAttribute("aria-expanded", String(open));
    $("refHistory").hidden = !open;
    if (!open) return;
    $("refHistoryRanges").innerHTML = HISTORY_RANGES.map(
      (r) =>
        `<button type="button" class="staff-field" data-ref-hist-range="${r.id}" aria-pressed="${
          r.id === state.refHistoryRange
        }">${r.label}</button>`
    ).join("");
    const cutoff = historyCutoff(state.refHistoryRange);
    const rows = p.referralHistory
      .filter((h) => h.stoppedAt && new Date(`${h.stoppedAt}T00:00:00`) >= cutoff)
      .sort((a, b) => (a.stoppedAt < b.stoppedAt ? 1 : -1));
    $("refHistoryList").innerHTML = rows.length
      ? rows
          .map((h) => {
            const title = [h.specialty, h.toProvider].filter(Boolean).join(" — ");
            const extra = [h.date, h.status, h.authNumber].filter(Boolean).join(" · ");
            return `
        <div class="history-row">
          <strong>${escapeHtml(title || "Outbound referral")}</strong>
          ${h.reason ? ` · ${escapeHtml(h.reason)}` : ""}
          ${extra ? `<div class="history-meta">${escapeHtml(extra)}</div>` : ""}
          <div class="history-meta">
            Removed ${escapeHtml(h.stoppedAt)}${h.stopReason ? ` — ${escapeHtml(h.stopReason)}` : ""}
            ${h.physicianApproved ? " · Physician approved" : ""}
          </div>
        </div>`;
          })
          .join("")
      : `<div class="empty">No referrals removed in this period.</div>`;
    applyRole();
  }

  function renderInbound() {
    const p = current();
    const root = $("inboundCard");
    const inn = p.inbound || {};
    const hasAny = [inn.name, inn.npi, inn.date, inn.specialty, inn.practice, inn.phone, inn.info].some(
      (v) => String(v || "").trim()
    );
    if (!hasAny) {
      root.innerHTML = `<div class="empty">No inbound referral on file from another office.</div>`;
      return;
    }
    const cell = (label, value) =>
      `<div><dt>${label}</dt><dd>${String(value || "").trim() ? escapeHtml(value) : "—"}</dd></div>`;
    root.innerHTML = `
      <dl class="readonly-grid">
        ${cell("Provider", inn.name)}
        ${cell("NPI", inn.npi)}
        ${cell("Date", inn.date)}
        ${cell("Specialty", inn.specialty)}
        ${cell("Practice", inn.practice)}
        ${cell("Phone", inn.phone)}
      </dl>
      <div class="readonly-info">
        <div class="readonly-label">Info</div>
        <p>${String(inn.info || "").trim() ? escapeHtml(inn.info) : "—"}</p>
      </div>`;
  }

  function renderRefs() {
    const p = current();
    const root = $("refList");
    if (!p.outbound.length) {
      root.innerHTML = `<div class="empty">No outbound referrals. Up to ${MAX_REFS}.</div>`;
      applyRole();
      renderRefHistory();
      return;
    }
    root.innerHTML = p.outbound
      .map((r) => {
        const isNew = state.unsavedRefIds.has(r.id) ? " is-new" : "";
        return `
      <article class="card ref-card${isNew}" data-ref="${r.id}">
        <button type="button" class="remove staff-field" data-remove-ref="${r.id}" title="${
          state.unsavedRefIds.has(r.id) ? "Cancel" : "Remove"
        }">×</button>
        <div class="card-grid ref-top">
          <div class="field">
            <label>Specialty</label>
            <select class="staff-field" data-k="specialty">${specialtyOptions(r.specialty)}</select>
          </div>
          <div class="field">
            <label>To Provider</label>
            <input class="staff-field" data-k="toProvider" value="${escapeHtml(r.toProvider)}" />
          </div>
        </div>
        <div class="card-grid ref-meta">
          <div class="field">
            <label>Date</label>
            <input type="date" class="staff-field" data-k="date" value="${escapeHtml(r.date)}" />
          </div>
          <div class="field">
            <label>Status</label>
            <select class="staff-field" data-k="status">${refStatusOptions(r.status)}</select>
          </div>
          <div class="field">
            <label>Auth #</label>
            <input class="staff-field" data-k="authNumber" value="${escapeHtml(r.authNumber)}" />
          </div>
        </div>
        <div class="field ref-reason">
          <label>Reason</label>
          <input class="staff-field" data-k="reason" value="${escapeHtml(r.reason)}" />
        </div>
      </article>`;
      })
      .join("");
    applyRole();
    renderRefHistory();
  }

  function renderDx() {
    const p = current();
    $("dxChips").innerHTML = p.diagnoses
      .map(
        (d) =>
          `<span class="chip"><code>${escapeHtml(d.code)}</code>${escapeHtml(
            d.label
          )}<button type="button" class="staff-field" data-remove-dx="${escapeHtml(
            d.code
          )}" aria-label="Remove ${escapeHtml(d.code)}">×</button></span>`
      )
      .join("");
    applyRole();
  }

  function formatVisitDate(iso) {
    if (!iso) return "";
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function renderNoteHistory() {
    const p = current();
    if (!p.noteHistory) p.noteHistory = [];
    const rows = [...p.noteHistory].sort((a, b) => (a.date < b.date ? 1 : -1));
    const root = $("noteHistoryList");
    if (!rows.length) {
      root.innerHTML = `<div class="empty">No previous visit notes.</div>`;
      return;
    }
    root.innerHTML = rows
      .map(
        (n) => `
      <article class="visit-note">
        <time datetime="${escapeHtml(n.date)}">${escapeHtml(formatVisitDate(n.date))}</time>
        <p>${escapeHtml(n.text)}</p>
      </article>`
      )
      .join("");
  }

  function renderSummaries() {
    const p = current();
    if (!p) return;
    qs("coverage").textContent = [p.payerName, p.insuranceType, p.memberId]
      .filter(Boolean)
      .join(" · ");
    qs("meds").textContent = `${p.medications.length} meds`;
    const inbound = p.inbound?.name ? "in" : "";
    qs("referrals").textContent = [
      inbound ? "1 in" : "",
      `${p.outbound.length} out`,
    ]
      .filter(Boolean)
      .join(" · ");
    qs("dx").textContent = p.diagnoses.length
      ? `${p.diagnoses.length} dx · ${p.diagnoses.map((d) => d.code).join(", ")}`
      : "No diagnoses";
    qs("notes").textContent = p.notes ? p.notes.slice(0, 72) + (p.notes.length > 72 ? "…" : "") : "";
  }

  function qs(section) {
    return document.querySelector(`[data-summary="${section}"]`);
  }

  function missingRequired(p) {
    return REQUIRED_FIELDS.filter((key) => !String(p[key] || "").trim());
  }

  function highlightRequired(missing) {
    document.querySelectorAll("[data-required]").forEach((el) => {
      el.classList.toggle("invalid", missing.includes(el.dataset.required));
    });
  }

  function trySave() {
    readScalarFields();
    const p = current();
    const missing = missingRequired(p);
    highlightRequired(missing);
    if (missing.length) {
      const el = $("saveMeta");
      el.textContent = "Required fields missing";
      el.classList.add("is-error");
      el.classList.add("is-dirty");
      const first = document.querySelector(".field.invalid input, .field.invalid select");
      first?.focus();
      return false;
    }
    persist();
    return true;
  }

  function isBlankDraft(p) {
    if (!p) return false;
    return !p.firstName && !p.lastName && !p.dob && !p.phone && !p.memberId;
  }

  function applyDraftChrome() {
    const drafting = Boolean(state.newDraftId && state.currentId === state.newDraftId);
    $("btnNew").hidden = drafting;
    $("btnCancelNew").hidden = !drafting;
  }

  function cancelNewPatient() {
    if (!state.newDraftId) return;
    const draftId = state.newDraftId;
    const returnId = state.newDraftReturnId;
    state.patients = state.patients.filter((p) => p.id !== draftId);
    state.newDraftId = null;
    state.newDraftReturnId = null;
    const fallback = state.patients[0]?.id || null;
    state.currentId = returnId && state.patients.some((p) => p.id === returnId) ? returnId : fallback;
    highlightRequired([]);
    fillForm();
    state.dirty = isPatientDirty(current());
    renderSaveMeta();
    applyDraftChrome();
  }

  function renderSaveMeta() {
    const el = $("saveMeta");
    el.classList.remove("is-error");
    const p = current();
    if (p && state.newDraftId === p.id && isBlankDraft(p)) {
      el.textContent = "";
      el.classList.remove("is-dirty");
      return;
    }
    if (state.dirty) {
      el.textContent = "Unsaved";
      el.classList.add("is-dirty");
      return;
    }
    el.classList.remove("is-dirty");
    if (!state.savedAt) {
      el.textContent = "Saved";
      return;
    }
    el.textContent = `Saved ${state.savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }

  function applyCollapsed() {
    document.querySelectorAll(".panel.collapsed").forEach((sec) => {
      if (sec.id !== "secIdentity") sec.classList.remove("collapsed");
    });
  }

  function applyMore() {
    const open = state.more.identity;
    $("identityMore").hidden = !open;
    $("secIdentity").classList.toggle("extras-open", open);
  }

  function applyRole() {
    const staff = state.role === "staff";
    document.body.dataset.role = state.role;
    $("roleStaff").setAttribute("aria-pressed", String(staff));
    $("rolePhysician").setAttribute("aria-pressed", String(!staff));
    document.querySelectorAll(".staff-field").forEach((el) => {
      el.disabled = !staff;
    });
    document.querySelectorAll(".physician-field").forEach((el) => {
      el.disabled = staff;
    });
    applyDraftChrome();
    syncColumnHeights();
  }

  function syncColumnHeights() {
    const app = document.querySelector(".app");
    const columns = document.querySelector(".columns");
    const meds = $("secMeds");
    const coverage = $("secCoverage");
    const refs = $("secReferrals");
    const notes = $("secNotes");
    if (!columns || !meds || !app) return;
    [columns, meds, coverage, refs].forEach((el) => {
      if (el) el.style.height = "";
    });
    if (state.role === "physician") return;
    requestAnimationFrame(() => {
      const appH = app.getBoundingClientRect().height;
      const headerH = document.querySelector(".topbar")?.getBoundingClientRect().height || 48;
      const identityH = $("secIdentity")?.getBoundingClientRect().height || 0;
      const dxH = $("secDx")?.getBoundingClientRect().height || 0;
      const natural = Math.ceil(meds.getBoundingClientRect().height);
      const notesHead = notes?.querySelector(".panel-h")?.getBoundingClientRect().height || 32;
      const notesField = notes?.querySelector(".field")?.getBoundingClientRect().height || 90;
      const hist = notes?.querySelector(".note-history");
      const histNatural = hist ? Math.min(180, hist.scrollHeight) : 0;
      const notesNatural = Math.ceil(notesHead + notesField + histNatural + 16);
      const gaps = 8 * 4;
      const pad = 18;
      const notesFloor = 176;
      const available = Math.floor(appH - headerH - identityH - dxH - notesNatural - gaps - pad);
      const maxH = Math.floor(appH - headerH - identityH - dxH - notesFloor - gaps - pad);
      const base = Math.max(160, Math.min(natural || 160, available));
      const h = Math.max(160, Math.min(base + 100, maxH));
      columns.style.height = `${h}px`;
      if (coverage) coverage.style.height = `${h}px`;
      if (refs) refs.style.height = `${h}px`;
      meds.style.height = `${h}px`;
    });
  }

  function discardNewMed(id) {
    const p = current();
    if (!p || !state.unsavedMedIds.has(id)) return false;
    p.medications = p.medications.filter((m) => m.id !== id);
    state.unsavedMedIds.delete(id);
    markDirty();
    renderMeds();
    renderSummaries();
    syncColumnHeights();
    return true;
  }

  function discardNewRef(id) {
    const p = current();
    if (!p || !state.unsavedRefIds.has(id)) return false;
    p.outbound = p.outbound.filter((r) => r.id !== id);
    state.unsavedRefIds.delete(id);
    markDirty();
    renderRefs();
    renderSummaries();
    syncColumnHeights();
    return true;
  }

  function openMedCancel(id) {
    const med = current().medications.find((m) => m.id === id);
    if (!med) return;
    state.pendingMedCancel = id;
    $("medCancelLead").textContent = med.name
      ? `Remove ${med.name}${med.strength ? ` ${med.strength}` : ""} from the current list.`
      : "Remove this medication from the current list.";
    $("medCancelReason").value = "";
    $("medCancelApproved").checked = false;
    $("medCancelConfirm").disabled = true;
    const modal = $("medCancelModal");
    modal.hidden = false;
    modal.classList.add("open");
    $("medCancelReason").focus();
  }

  function closeMedCancel() {
    state.pendingMedCancel = null;
    const modal = $("medCancelModal");
    modal.classList.remove("open");
    modal.hidden = true;
  }

  function updateCancelConfirm() {
    $("medCancelConfirm").disabled = !(
      $("medCancelReason").value.trim() && $("medCancelApproved").checked
    );
  }

  function confirmMedCancel() {
    const p = current();
    const id = state.pendingMedCancel;
    const med = p.medications.find((m) => m.id === id);
    if (!med || !$("medCancelReason").value.trim() || !$("medCancelApproved").checked) return;
    if (!p.medicationHistory) p.medicationHistory = [];
    p.medicationHistory.unshift({
      id: med.id,
      name: med.name,
      strength: med.strength,
      directions: med.directions,
      stoppedAt: new Date().toISOString().slice(0, 10),
      stopReason: $("medCancelReason").value.trim(),
      physicianApproved: true,
    });
    p.medications = p.medications.filter((m) => m.id !== id);
    state.unsavedMedIds.delete(id);
    closeMedCancel();
    markDirty();
    renderMeds();
    renderSummaries();
    syncColumnHeights();
  }

  function openRefCancel(id) {
    const ref = current().outbound.find((r) => r.id === id);
    if (!ref) return;
    state.pendingRefCancel = id;
    const label = [ref.specialty, ref.toProvider].filter(Boolean).join(" — ");
    $("refCancelLead").textContent = label
      ? `Remove the outbound referral to ${label}.`
      : "Remove this outbound referral.";
    $("refCancelReason").value = "";
    $("refCancelApproved").checked = false;
    $("refCancelConfirm").disabled = true;
    const modal = $("refCancelModal");
    modal.hidden = false;
    modal.classList.add("open");
    $("refCancelReason").focus();
  }

  function closeRefCancel() {
    state.pendingRefCancel = null;
    const modal = $("refCancelModal");
    modal.classList.remove("open");
    modal.hidden = true;
  }

  function updateRefCancelConfirm() {
    $("refCancelConfirm").disabled = !(
      $("refCancelReason").value.trim() && $("refCancelApproved").checked
    );
  }

  function confirmRefCancel() {
    const p = current();
    const id = state.pendingRefCancel;
    const ref = p.outbound.find((r) => r.id === id);
    if (!ref || !$("refCancelReason").value.trim() || !$("refCancelApproved").checked) return;
    if (!p.referralHistory) p.referralHistory = [];
    p.referralHistory.unshift({
      id: ref.id,
      specialty: ref.specialty,
      toProvider: ref.toProvider,
      reason: ref.reason,
      date: ref.date,
      status: ref.status,
      authNumber: ref.authNumber,
      stoppedAt: new Date().toISOString().slice(0, 10),
      stopReason: $("refCancelReason").value.trim(),
      physicianApproved: true,
    });
    p.outbound = p.outbound.filter((r) => r.id !== id);
    state.unsavedRefIds.delete(id);
    closeRefCancel();
    markDirty();
    renderRefs();
    renderSummaries();
    syncColumnHeights();
  }

  function revealNewCard(selector) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const card = document.querySelector(selector);
        if (!card) return;
        const scroller = card.closest(".panel-b");
        if (scroller) {
          const delta = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
          scroller.scrollTop += delta - 8;
        }
        card.querySelector("input, select")?.focus();
      });
    });
  }

  function addMed() {
    const p = current();
    if (p.medications.length >= MAX_MEDS) return;
    const id = uid("med");
    p.medications.unshift({
      id,
      name: "",
      strength: "",
      directions: "",
      action: "start",
    });
    state.unsavedMedIds.add(id);
    markDirty();
    renderMeds();
    renderSummaries();
    syncColumnHeights();
    revealNewCard(`[data-med="${id}"]`);
  }

  function addRef() {
    const p = current();
    if (p.outbound.length >= MAX_REFS) return;
    const id = uid("ref");
    p.outbound.unshift({
      id,
      specialty: "Other",
      toProvider: "",
      reason: "",
      date: new Date().toISOString().slice(0, 10),
      status: "requested",
      authNumber: "",
    });
    state.unsavedRefIds.add(id);
    markDirty();
    renderRefs();
    renderSummaries();
    syncColumnHeights();
    revealNewCard(`[data-ref="${id}"]`);
  }

  function addDx(item) {
    const p = current();
    if (p.diagnoses.length >= MAX_DX) return;
    if (p.diagnoses.some((d) => d.code === item.code)) return;
    p.diagnoses.push({ code: item.code, label: item.label });
    $("dxSearch").value = "";
    $("dxSuggest").classList.remove("open");
    markDirty();
    renderDx();
    renderSummaries();
  }

  function addDxFromSearch() {
    const first = $("dxSuggest").querySelector("[data-dx-code]");
    if (first) {
      const item = window.JR_ICD10.find((d) => d.code === first.dataset.dxCode);
      if (item) addDx(item);
      return;
    }
    const matches = filterDx($("dxSearch").value);
    if (matches[0]) addDx(matches[0]);
    else $("dxSearch").focus();
  }

  function filterDx(q) {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return window.JR_ICD10.filter(
      (d) => d.code.toLowerCase().includes(query) || d.label.toLowerCase().includes(query)
    ).slice(0, 8);
  }

  function renderSuggest(items) {
    const box = $("dxSuggest");
    if (!items.length) {
      box.classList.remove("open");
      box.innerHTML = "";
      return;
    }
    box.innerHTML = items
      .map(
        (d, i) =>
          `<button type="button" data-dx-code="${d.code}" class="${i === 0 ? "active" : ""}"><code>${d.code}</code>${escapeHtml(
            d.label
          )}</button>`
      )
      .join("");
    box.classList.add("open");
  }

  function bind() {
    document.addEventListener("input", (e) => {
      const t = e.target;
      if (t.closest(".identity") || t.closest("#secCoverage") || t.id === "notes") {
        readScalarFields();
        markDirty();
      }
      const med = t.closest("[data-med]");
      if (med) {
        const row = current().medications.find((m) => m.id === med.dataset.med);
        const k = t.dataset.k;
        if (row && k) {
          row[k] = t.type === "checkbox" ? t.checked : t.value;
          markDirty();
          renderSummaries();
        }
      }
      const ref = t.closest("[data-ref]");
      if (ref) {
        const row = current().outbound.find((r) => r.id === ref.dataset.ref);
        const k = t.dataset.k;
        if (row && k) {
          row[k] = t.value;
          markDirty();
          renderSummaries();
        }
      }
      if (t.id === "dxSearch") renderSuggest(filterDx(t.value));
    });

    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t.type === "checkbox" && (t.closest("#secCoverage") || t.closest(".identity"))) {
        readScalarFields();
        markDirty();
      }
    });

    document.addEventListener("click", (e) => {
      const collapse = e.target.closest("[data-collapse]");
      if (collapse && collapse.classList.contains("collapsible") && !e.target.closest(".h-actions")) {
        const key = collapse.dataset.collapse;
        if (key === "identity") {
          state.more.identity = !state.more.identity;
          applyMore();
          syncColumnHeights();
          return;
        }
        state.collapsed[key] = !state.collapsed[key];
        applyCollapsed();
        syncColumnHeights();
        return;
      }
      const rmMed = e.target.closest("[data-remove-med]");
      if (rmMed) {
        const id = rmMed.dataset.removeMed;
        if (!discardNewMed(id)) openMedCancel(id);
        return;
      }
      const rangeBtn = e.target.closest("[data-hist-range]");
      if (rangeBtn) {
        state.medHistoryRange = rangeBtn.dataset.histRange;
        renderMedHistory();
        syncColumnHeights();
        return;
      }
      const refRangeBtn = e.target.closest("[data-ref-hist-range]");
      if (refRangeBtn) {
        state.refHistoryRange = refRangeBtn.dataset.refHistRange;
        renderRefHistory();
        syncColumnHeights();
        return;
      }
      const rmRef = e.target.closest("[data-remove-ref]");
      if (rmRef) {
        const id = rmRef.dataset.removeRef;
        if (!discardNewRef(id)) openRefCancel(id);
        return;
      }
      const rmDx = e.target.closest("[data-remove-dx]");
      if (rmDx) {
        const p = current();
        p.diagnoses = p.diagnoses.filter((d) => d.code !== rmDx.dataset.removeDx);
        markDirty();
        renderDx();
        renderSummaries();
        return;
      }
      const pick = e.target.closest("[data-dx-code]");
      if (pick) {
        const item = window.JR_ICD10.find((d) => d.code === pick.dataset.dxCode);
        if (item) addDx(item);
      }
    });

    $("patientSelect").addEventListener("change", (e) => {
      const prev = current();
      readScalarFields();
      if (state.newDraftId && prev?.id === state.newDraftId && missingRequired(prev).length) {
        state.patients = state.patients.filter((x) => x.id !== prev.id);
        state.newDraftId = null;
        state.newDraftReturnId = null;
      } else if (prev && missingRequired(prev).length === 0) persist();
      else if (prev && isBlankDraft(prev)) {
        state.patients = state.patients.filter((x) => x.id !== prev.id);
      }
      state.currentId = e.target.value;
      if (!state.patients.some((p) => p.id === state.currentId)) {
        state.currentId = state.patients[0]?.id || null;
      }
      highlightRequired([]);
      fillForm();
      applyDraftChrome();
    });

    $("roleStaff").addEventListener("click", () => {
      state.role = "staff";
      applyRole();
    });
    $("rolePhysician").addEventListener("click", () => {
      state.role = "physician";
      applyRole();
    });

    $("medCancelDismiss").addEventListener("click", closeMedCancel);
    $("medCancelConfirm").addEventListener("click", confirmMedCancel);
    $("medCancelReason").addEventListener("input", updateCancelConfirm);
    $("medCancelApproved").addEventListener("change", updateCancelConfirm);
    $("medCancelModal").addEventListener("click", (e) => {
      if (e.target.id === "medCancelModal") closeMedCancel();
    });
    $("refCancelDismiss").addEventListener("click", closeRefCancel);
    $("refCancelConfirm").addEventListener("click", confirmRefCancel);
    $("refCancelReason").addEventListener("input", updateRefCancelConfirm);
    $("refCancelApproved").addEventListener("change", updateRefCancelConfirm);
    $("refCancelModal").addEventListener("click", (e) => {
      if (e.target.id === "refCancelModal") closeRefCancel();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("medCancelModal").hidden) {
        closeMedCancel();
        return;
      }
      if (!$("refCancelModal").hidden) {
        closeRefCancel();
        return;
      }
      if (state.newDraftId && state.currentId === state.newDraftId) cancelNewPatient();
    });
    $("btnAddMed").addEventListener("click", addMed);
    $("btnMedHistory").addEventListener("click", () => {
      state.medHistoryOpen = !state.medHistoryOpen;
      renderMedHistory();
      syncColumnHeights();
    });
    $("btnRefHistory").addEventListener("click", () => {
      state.refHistoryOpen = !state.refHistoryOpen;
      renderRefHistory();
      syncColumnHeights();
    });
    $("btnAddRef").addEventListener("click", addRef);
    $("btnSave").addEventListener("click", () => {
      trySave();
    });
    $("btnNew").addEventListener("click", () => {
      const prev = current();
      readScalarFields();
      if (prev && missingRequired(prev).length === 0) persist();
      else if (prev && isBlankDraft(prev)) {
        state.patients = state.patients.filter((x) => x.id !== prev.id);
      } else if (prev && missingRequired(prev).length) {
        highlightRequired(missingRequired(prev));
        const el = $("saveMeta");
        el.textContent = "Required fields missing";
        el.classList.add("is-error", "is-dirty");
        return;
      }
      const returnId = prev && state.patients.some((p) => p.id === prev.id) ? prev.id : state.currentId;
      const p = emptyPatient();
      state.patients.unshift(p);
      state.currentId = p.id;
      state.newDraftId = p.id;
      state.newDraftReturnId = returnId;
      highlightRequired([]);
      fillForm();
      markDirty();
      applyDraftChrome();
    });
    $("btnCancelNew").addEventListener("click", cancelNewPatient);

    $("btnAddDx").addEventListener("click", addDxFromSearch);
    $("dxSearch").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addDxFromSearch();
      }
      if (e.key === "Escape") $("dxSuggest").classList.remove("open");
    });

    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        trySave();
      }
    });

    window.addEventListener("beforeunload", () => {
      const p = current();
      if (state.dirty && p && missingRequired(p).length === 0) persist();
    });
  }

  function init() {
    load();
    fillSelects();
    applyCollapsed();
    applyMore();
    fillForm();
    readScalarFields();
    rememberSaved(current());
    applyRole();
    bind();
    renderSaveMeta();
    window.addEventListener("resize", syncColumnHeights);
  }

  init();
})();
