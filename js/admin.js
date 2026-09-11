/**
 * Admin Dashboard controller: Payments, Add Course, Course Management.
 *
 * Frontend admin checks here are for UI/UX only (hiding controls from normal
 * users). Actual enforcement happens in Firestore/Storage Security Rules,
 * which must verify the caller's custom `admin` claim before allowing any
 * write to courses, payments, or another user's entitlements. See README.md
 * for how to set the custom claim.
 */
import { fetchAllCourses, adminAddCourse, adminUpdateCourse, adminDeleteCourse } from "./courses.js";
import { fetchAllPayments, approvePayment, rejectPayment, fetchBankDetails, saveBankDetails } from "./payments.js";
import { toast, setButtonLoading } from "./main.js";

let allPayments = [];
let allCourses = [];
let activePaymentFilter = "all";

/* ---------------- Tabs ---------------- */
export function initTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });
}

/* ---------------- Payments Tab ---------------- */
function paymentRowHTML(p) {
  const date = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString() : "—";
  const proofLink = p.proofURL
    ? `<button class="btn btn--ghost btn--small" data-view-proof="${p.proofURL}">View Proof</button>`
    : (p.reference ? `<span class="muted">Ref: ${p.reference.slice(0, 10)}…</span>` : "—");

  const actions = p.status === "pending" || p.status === "pending_verification"
    ? `<button class="btn btn--success btn--small" data-approve="${p.id}">Approve</button>
       <button class="btn btn--danger btn--small" data-reject="${p.id}">Reject</button>`
    : `<span class="muted">No actions</span>`;

  return `
    <tr>
      <td>${p.email || "—"}</td>
      <td>${p.paymentType === "premium" ? "Premium (all courses)" : (p.courseCode || "—")}</td>
      <td>${p.paymentType}</td>
      <td>₦${(p.amount || 0).toLocaleString()}</td>
      <td>${p.method}</td>
      <td>${proofLink}</td>
      <td><span class="status-pill status-pill--${p.status}">${p.status.replace("_", " ")}</span></td>
      <td>${date}</td>
      <td class="row">${actions}</td>
    </tr>`;
}

function renderPayments() {
  const tbody = document.getElementById("paymentsTableBody");
  let list = allPayments;
  if (activePaymentFilter !== "all") {
    list = allPayments.filter((p) => {
      if (["pending", "approved", "rejected"].includes(activePaymentFilter)) {
        return p.status === activePaymentFilter || (activePaymentFilter === "pending" && p.status === "pending_verification");
      }
      if (activePaymentFilter === "transfer") return p.method === "transfer";
      if (activePaymentFilter === "course" || activePaymentFilter === "premium") return p.paymentType === activePaymentFilter;
      return true;
    });
  }

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center muted" style="padding:30px;">No payments match this filter.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(paymentRowHTML).join("");

  tbody.querySelectorAll("[data-view-proof]").forEach((btn) => {
    btn.addEventListener("click", () => openProofModal(btn.dataset.viewProof));
  });
  tbody.querySelectorAll("[data-approve]").forEach((btn) => {
    btn.addEventListener("click", () => handleApprove(btn.dataset.approve, btn));
  });
  tbody.querySelectorAll("[data-reject]").forEach((btn) => {
    btn.addEventListener("click", () => handleReject(btn.dataset.reject, btn));
  });
}

function openProofModal(url) {
  const modal = document.getElementById("proofModal");
  const img = document.getElementById("proofModalImg");
  const frame = document.getElementById("proofModalFrame");
  const link = document.getElementById("proofModalOpen");
  const note = document.getElementById("proofModalNote");
  if (!modal) return;

  const cleanUrl = String(url || "").split("?")[0];
  const isPdf = /\.pdf$/i.test(cleanUrl) || cleanUrl.includes("/raw/");

  if (link) link.href = url;
  if (note) note.textContent = "";

  if (isPdf) {
    if (img) { img.hidden = true; img.removeAttribute("src"); }
    if (frame) { frame.hidden = false; frame.src = url; }
  } else {
    if (frame) { frame.hidden = true; frame.removeAttribute("src"); }
    if (img) {
      img.hidden = false;
      img.onerror = () => {
        img.hidden = true;
        if (note) note.textContent = "This proof could not be displayed here. Use \u201cOpen in new tab\u201d to view it.";
      };
      img.src = url;
    }
  }

  modal.classList.add("open");
}

document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.getElementById("proofModalClose");
  if (closeBtn) closeBtn.addEventListener("click", () => document.getElementById("proofModal").classList.remove("open"));
});

async function handleApprove(paymentId, btn) {
  const payment = allPayments.find((p) => p.id === paymentId);
  if (!payment) return;
  const label = payment.paymentType === "premium" ? "grant Premium access" : `unlock ${payment.courseCode} only`;
  if (!confirm(`Approve this payment and ${label} for ${payment.email}?`)) return;
  setButtonLoading(btn, true, "Approving...");
  try {
    await approvePayment(payment.id);
    toast("Payment approved and access granted.", "success");
    await loadPayments();
  } catch (err) {
    toast(err.message || "Could not approve payment.", "error");
  }
  setButtonLoading(btn, false);
}

async function handleReject(paymentId, btn) {
  const payment = allPayments.find((p) => p.id === paymentId);
  if (!payment) return;
  if (!confirm(`Reject this payment from ${payment.email}? No access will be granted.`)) return;
  setButtonLoading(btn, true, "Rejecting...");
  try {
    await rejectPayment(payment.id);
    toast("Payment rejected.", "info");
    await loadPayments();
  } catch (err) {
    toast(err.message || "Could not reject payment.", "error");
  }
  setButtonLoading(btn, false);
}

async function loadPayments() {
  const tbody = document.getElementById("paymentsTableBody");
  tbody.innerHTML = `<tr><td colspan="9" class="text-center muted" style="padding:30px;">Loading payments…</td></tr>`;
  try {
    allPayments = await fetchAllPayments();
    renderPayments();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center muted" style="padding:30px;">Couldn't load payments. You may not have admin access, or a required Firestore index is missing.</td></tr>`;
  }
}

export function initPaymentsTab() {
  document.querySelectorAll(".filter-chip[data-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip[data-filter]").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      activePaymentFilter = chip.dataset.filter;
      renderPayments();
    });
  });
  loadPayments();
}

/* ---------------- Add Course Tab ---------------- */
export function initAddCourseTab() {
  const form = document.getElementById("addCourseForm");
  const fileInput = document.getElementById("coursePdfInput");
  const fileNameEl = document.getElementById("coursePdfFileName");
  const dropZone = document.getElementById("coursePdfDrop");
  const progressWrap = document.getElementById("addCourseProgress");
  const progressFill = document.getElementById("addCourseProgressFill");

  dropZone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    fileNameEl.textContent = file ? `Selected: ${file.name}` : "";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const codeInput = document.getElementById("courseCodeInput");
    const nameInput = document.getElementById("courseNameInput");
    const freeToggle = document.getElementById("courseFreeToggle");
    const errorsEl = document.getElementById("addCourseErrors");
    const submitBtn = document.getElementById("addCourseSubmitBtn");
    errorsEl.innerHTML = "";

    const code = codeInput.value.trim();
    const name = nameInput.value.trim();
    const file = fileInput.files[0];
    const errors = [];

    if (!code) errors.push("Course code is required.");
    if (!name) errors.push("Course name is required.");
    if (!file) errors.push("A PDF file is required.");
    else if (file.type !== "application/pdf") errors.push("Only PDF files are allowed.");
    if (code && allCourses.some((c) => c.code.toUpperCase() === code.toUpperCase())) {
      errors.push(`A course with code "${code.toUpperCase()}" already exists. Use Course Management to edit it instead.`);
    }

    if (errors.length) {
      errorsEl.innerHTML = errors.map((e) => `<div class="alert alert--error">${e}</div>`).join("");
      return;
    }

    setButtonLoading(submitBtn, true, "Uploading...");
    progressWrap.style.display = "block";
    try {
      await adminAddCourse(
        { code, name, isFree: freeToggle.checked, file },
        (pct) => (progressFill.style.width = pct + "%")
      );
      toast("Course Added Successfully", "success");
      form.reset();
      fileNameEl.textContent = "";
      progressWrap.style.display = "none";
      progressFill.style.width = "0%";
      await refreshCourseManagement();
    } catch (err) {
      errorsEl.innerHTML = `<div class="alert alert--error">${err.message || "Could not add course. Please try again."}</div>`;
    }
    setButtonLoading(submitBtn, false);
  });
}

/* ---------------- Course Management Tab ---------------- */
function courseManagementRowHTML(course) {
  const date = course.createdAt?.toDate ? course.createdAt.toDate().toLocaleDateString() : "—";
  return `
    <tr>
      <td>${course.code}</td>
      <td>${course.name}</td>
      <td>${course.isFree ? '<span class="badge badge--free">Free</span>' : '<span class="badge badge--premium">Paid</span>'}</td>
      <td>${date}</td>
      <td>${(course.pdfURL || course.pdfPublicId) ? "✅ Uploaded" : "⚠️ Missing"}</td>
      <td class="row">
        <button class="btn btn--ghost btn--small" data-toggle-free="${course.id}">${course.isFree ? "Make Paid" : "Make Free"}</button>
        <button class="btn btn--danger btn--small" data-delete-course="${course.id}">Delete</button>
      </td>
    </tr>`;
}

async function refreshCourseManagement() {
  const tbody = document.getElementById("courseManagementBody");
  tbody.innerHTML = `<tr><td colspan="6" class="text-center muted" style="padding:30px;">Loading courses…</td></tr>`;
  try {
    allCourses = await fetchAllCourses();
    if (!allCourses.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center muted" style="padding:30px;">No courses yet. Add one using the "Add Course" tab.</td></tr>`;
      return;
    }
    tbody.innerHTML = allCourses.map(courseManagementRowHTML).join("");

    tbody.querySelectorAll("[data-toggle-free]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const course = allCourses.find((c) => c.id === btn.dataset.toggleFree);
        if (!confirm(`Change "${course.code}" to ${course.isFree ? "Paid" : "Free"}?`)) return;
        try {
          await adminUpdateCourse(course.id, { isFree: !course.isFree });
          toast("Course updated.", "success");
          refreshCourseManagement();
        } catch (err) {
          toast(err.message || "Could not update course.", "error");
        }
      });
    });
    tbody.querySelectorAll("[data-delete-course]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const course = allCourses.find((c) => c.id === btn.dataset.deleteCourse);
        const typed = prompt(`Type the course code "${course.code}" to confirm permanent deletion.`);
        if (typed !== course.code) {
          if (typed !== null) toast("Course code didn't match — deletion cancelled.", "info");
          return;
        }
        try {
          await adminDeleteCourse(course);
          toast("Course deleted.", "success");
          refreshCourseManagement();
        } catch (err) {
          toast(err.message || "Could not delete course.", "error");
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center muted" style="padding:30px;">Couldn't load courses.</td></tr>`;
  }
}

export function initCourseManagementTab() {
  refreshCourseManagement();
}

/* ---------------- Bank Details Tab ---------------- */
export async function initBankDetailsTab() {
  const form = document.getElementById("bankDetailsForm");
  if (!form) return;

  try {
    const details = await fetchBankDetails();
    document.getElementById("bankNameInput").value = details.bankName || "";
    document.getElementById("accountNameInput").value = details.accountName || "";
    document.getElementById("accountNumberInput").value = details.accountNumber || "";
  } catch (err) {
    toast("Could not load current bank details.", "error");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("bankDetailsSubmitBtn");
    const bankName = document.getElementById("bankNameInput").value.trim();
    const accountName = document.getElementById("accountNameInput").value.trim();
    const accountNumber = document.getElementById("accountNumberInput").value.trim();
    if (!bankName || !accountName || !accountNumber) {
      toast("Fill in all three bank fields.", "error");
      return;
    }
    setButtonLoading(btn, true, "Saving...");
    try {
      await saveBankDetails({ bankName, accountName, accountNumber });
      toast("Bank details saved.", "success");
    } catch (err) {
      toast(err.message || "Could not save bank details.", "error");
    }
    setButtonLoading(btn, false);
  });
}
