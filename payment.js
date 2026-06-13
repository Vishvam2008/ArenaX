// ============================================================
// ArenaX — Payment Verification Module
// Multi-step deposit wizard, admin payment review, QR management,
// duplicate detection, screenshot lightbox, server sync.
// Loads AFTER app.js and admin.js.
// ============================================================

// --------------- Extend Global State ---------------
state.paymentRequests = state.paymentRequests || [];
state.paymentNextId = state.paymentNextId || 1001;
state.qrConfig = state.qrConfig || { imageData: null, enabled: false, upiId: "", label: "ArenaX Payments", uploadedAt: null };
state.usedUTRs = state.usedUTRs || [];
state.screenshotHashes = state.screenshotHashes || [];
state.depositStep = 1;
state.currentUser = { id: "USR102", name: "RogueRavi", email: "rogue@arenax.gg", phone: "9876543210" };
state.paymentFilterStatus = "all";
state.paymentSearchQuery = "";

// --------------- Utility ---------------
function simpleHash(str) {
  var hash = 0;
  var len = Math.min(str.length, 50000);
  for (var i = 0; i < len; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

function getScreenshotUrl(req) {
  if (req.screenshotData && req.screenshotData.startsWith("data:image")) {
    return safeDataUrl(req.screenshotData);
  }
  var folder = req.status === "Approved" ? "Approved" : req.status === "Rejected" ? "Rejected" : "Pending";
  var url = "http://localhost:4400/api/screenshot?folder=" + folder + "&filename=" + encodeURIComponent(req.screenshotFilename);
  if (state.adminSession && state.adminSession.authHeader) {
    var token = state.adminSession.authHeader.split(" ")[1];
    url += "&auth=" + encodeURIComponent(token);
  } else {
    url += "&userId=" + encodeURIComponent(state.currentUser.id);
  }
  return url;
}

// --------------- Deposit Wizard ---------------
function advanceDepositStep(step) {
  state.depositStep = step;
  renderDepositWizard();
}

function renderDepositWizard() {
  var wizard = document.getElementById("depositWizard");
  if (!wizard) return;

  wizard.querySelectorAll(".step-dot").forEach(function(dot, i) {
    var s = i + 1;
    dot.classList.toggle("active", s === state.depositStep);
    dot.classList.toggle("completed", s < state.depositStep);
  });
  wizard.querySelectorAll(".step-line").forEach(function(line, i) {
    line.classList.toggle("completed", i + 1 < state.depositStep);
  });
  wizard.querySelectorAll(".wizard-step").forEach(function(step) {
    step.classList.toggle("active", Number(step.dataset.wizardStep) === state.depositStep);
  });

  // Step 2 — render QR
  if (state.depositStep === 2) {
    var qrCard = document.getElementById("qrDisplayCard");
    var amt = Number(document.getElementById("depositAmount").value) || 0;
    if (state.qrConfig.enabled && state.qrConfig.imageData) {
      qrCard.innerHTML =
        '<div class="qr-image-container"><img src="' + state.qrConfig.imageData + '" alt="Payment QR Code"></div>' +
        '<div class="qr-info"><span>' + escapeHTML(state.qrConfig.label) + '</span>' +
        (state.qrConfig.upiId ? '<strong>' + escapeHTML(state.qrConfig.upiId) + '</strong>' : '') + '</div>' +
        '<p class="muted" style="margin-top:12px">Scan this QR code to pay <strong>' + rupees(amt) + '</strong></p>';
    } else {
      qrCard.innerHTML = '<div class="qr-disabled-notice">Payments are currently disabled. Admin has not configured a QR code. Please try again later.</div>';
    }
  }
}

function submitPaymentRequest() {
  var amount = Number(document.getElementById("depositAmount").value);
  var utr = (document.getElementById("utrInput").value || "").trim();
  var fileInput = document.getElementById("screenshotInput");

  if (!Number.isFinite(amount) || amount < 10) { showToast("Minimum deposit amount is \u20b910."); return; }
  if (!utr || utr.length < 6) { showToast("Enter a valid UTR/Transaction ID (min 6 characters)."); return; }
  if (state.usedUTRs.indexOf(utr) !== -1) { showToast("This UTR has already been submitted. Duplicate payments are blocked."); return; }
  if (!fileInput.files || !fileInput.files[0]) { showToast("Please upload a payment screenshot."); return; }

  var submitBtn = document.getElementById("submitPayment");
  var originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  var file = fileInput.files[0];
  var reader = new FileReader();
  reader.onload = function(e) {
    var screenshotData = e.target.result;
    var hash = simpleHash(screenshotData);
    var isDupScreenshot = state.screenshotHashes.indexOf(hash) !== -1;

    var now = new Date();
    var dateStr = now.toISOString().split("T")[0];
    var safeUtrForFile = utr.replace(/[^a-z0-9_-]/gi, "").slice(0, 48);
    var requestId = "PAY-" + state.paymentNextId++;
    var filename = requestId + "_" + state.currentUser.id + "_" + amount + "_" + safeUtrForFile + "_" + dateStr + ".jpg";

    var paymentRequest = {
      requestId: requestId,
      userId: state.currentUser.id,
      userName: state.currentUser.name,
      userEmail: state.currentUser.email,
      userPhone: state.currentUser.phone,
      amount: amount,
      utrNumber: utr,
      screenshotData: screenshotData,
      screenshotFilename: filename,
      screenshotHash: hash,
      submittedAt: now.toISOString(),
      status: "Pending Verification",
      adminNotes: "",
      reviewedAt: null,
      linkedRequestId: null,
      duplicateFlags: []
    };

    if (isDupScreenshot) paymentRequest.duplicateFlags.push("Duplicate screenshot detected");
    var sameCombo = state.paymentRequests.find(function(r) { return r.amount === amount && r.utrNumber === utr; });
    if (sameCombo) paymentRequest.duplicateFlags.push("Same amount + UTR combination already exists");

    syncToPaymentServer("submit", paymentRequest)
      .then(function(res) {
        paymentRequest.screenshotFilename = res.filename || filename;
        state.usedUTRs.push(utr);
        state.screenshotHashes.push(hash);
        state.paymentRequests.unshift(paymentRequest);

        var req = addRequest("Deposit", amount, "QR Payment | UTR: " + utr + " | " + paymentRequest.requestId);
        paymentRequest.linkedRequestId = req.id;

        audit("Payment request " + paymentRequest.requestId + " submitted by " + state.currentUser.name + ". Amount: " + rupees(amount) + ", UTR: " + utr + ".");

        var details = document.getElementById("confirmationDetails");
        if (details) {
          details.innerHTML =
            '<div>Request ID: <strong>' + escapeHTML(paymentRequest.requestId) + '</strong></div>' +
            '<div>Amount: <strong>' + rupees(amount) + '</strong></div>' +
            '<div>UTR: <strong>' + escapeHTML(utr) + '</strong></div>' +
            '<div>Status: <strong>Pending Verification</strong></div>' +
            '<div>Submitted: <strong>' + now.toLocaleString("en-IN") + '</strong></div>';
        }

        advanceDepositStep(4);
        renderUserPayments();
        if (state.adminAuthenticated) renderAdminPayments();
        if (typeof saveStateToLocalStorage === "function") saveStateToLocalStorage();
        showToast("Payment " + paymentRequest.requestId + " submitted for verification.");
      })
      .catch(function(err) {
        console.error("Submission failed:", err);
        showToast("Submission failed: " + err.message);
      })
      .finally(function() {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      });
  };
  reader.onerror = function() {
    showToast("Failed to read screenshot file.");
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  };
  reader.readAsDataURL(file);
}

// --------------- User Payment History ---------------
function renderUserPayments() {
  var container = document.getElementById("paymentHistoryList");
  if (!container) return;
  if (state.paymentRequests.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">\u{1F4CB}</div><span>No payment requests yet</span></div>';
    return;
  }
  container.innerHTML = state.paymentRequests.map(function(req) {
    var cls = req.status === "Approved" ? "approved" : req.status === "Rejected" ? "rejected" : "pending";
    var date = new Date(req.submittedAt).toLocaleString("en-IN");
    return '<div class="payment-history-item">' +
      '<div class="payment-history-header"><strong>' + escapeHTML(req.requestId) + ' \u2014 ' + rupees(req.amount) + '</strong>' +
      '<span class="status-badge status-badge--' + cls + '">' + escapeHTML(req.status) + '</span></div>' +
      '<div class="payment-history-meta"><span>UTR: ' + escapeHTML(req.utrNumber) + '</span><span>' + escapeHTML(date) + '</span></div>' +
      (req.adminNotes ? '<div class="admin-remark">Admin: ' + escapeHTML(req.adminNotes) + '</div>' : '') +
      (req.reviewedAt ? '<div class="payment-history-meta"><span>Reviewed: ' + new Date(req.reviewedAt).toLocaleString("en-IN") + '</span></div>' : '') +
    '</div>';
  }).join("");
}

// --------------- Admin Payment Review ---------------
function renderAdminPayments() {
  if (!state.adminAuthenticated) return;
  var statsEl = document.getElementById("paymentStats");
  var listEl = document.getElementById("paymentReviewList");
  if (!statsEl || !listEl) return;

  var pending = state.paymentRequests.filter(function(r) { return r.status === "Pending Verification"; });
  var approved = state.paymentRequests.filter(function(r) { return r.status === "Approved"; });
  var rejected = state.paymentRequests.filter(function(r) { return r.status === "Rejected"; });

  statsEl.innerHTML =
    '<div class="payment-stat stat-pending"><span>Pending</span><strong>' + pending.length + '</strong></div>' +
    '<div class="payment-stat stat-approved"><span>Approved</span><strong>' + approved.length + '</strong></div>' +
    '<div class="payment-stat stat-rejected"><span>Rejected</span><strong>' + rejected.length + '</strong></div>';

  var filtered = state.paymentRequests;
  if (state.paymentFilterStatus !== "all") {
    filtered = filtered.filter(function(r) { return r.status === state.paymentFilterStatus; });
  }
  if (state.paymentSearchQuery) {
    var q = state.paymentSearchQuery.toLowerCase();
    filtered = filtered.filter(function(r) {
      return r.requestId.toLowerCase().indexOf(q) !== -1 ||
        r.userName.toLowerCase().indexOf(q) !== -1 ||
        r.utrNumber.toLowerCase().indexOf(q) !== -1 ||
        r.userEmail.toLowerCase().indexOf(q) !== -1 ||
        String(r.amount).indexOf(q) !== -1;
    });
  }

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">\u2713</div><span>No payment requests match your filter</span></div>';
    return;
  }

  listEl.innerHTML = filtered.map(function(req) {
    var cls = req.status === "Approved" ? "approved" : req.status === "Rejected" ? "rejected" : "pending";
    var date = new Date(req.submittedAt).toLocaleString("en-IN");
    var dupWarnings = (req.duplicateFlags || []).map(function(f) { return '<div class="duplicate-banner">' + escapeHTML(f) + '</div>'; }).join("");
    var isPending = req.status === "Pending Verification";

    return '<div class="payment-review-card">' +
      '<div class="review-card-header"><strong>' + escapeHTML(req.requestId) + '</strong><span class="status-badge status-badge--' + cls + '">' + escapeHTML(req.status) + '</span></div>' +
      dupWarnings +
      '<div class="review-card-body">' +
        '<div class="review-screenshot">' +
          '<img src="' + getScreenshotUrl(req) + '" alt="Screenshot" data-lightbox-src="' + getScreenshotUrl(req) + '" title="Click to zoom">' +
          '<div class="review-screenshot-actions">' +
            '<button type="button" data-zoom-screenshot="' + req.requestId + '">\uD83D\uDD0D Zoom</button>' +
            '<button type="button" data-download-screenshot="' + req.requestId + '">\u2B07 Download</button>' +
          '</div>' +
        '</div>' +
        '<div class="review-card-grid">' +
          '<div class="review-card-detail"><span>Amount</span><strong>' + rupees(req.amount) + '</strong></div>' +
          '<div class="review-card-detail"><span>UTR Number</span><strong>' + escapeHTML(req.utrNumber) + '</strong></div>' +
          '<div class="review-card-detail"><span>User</span><strong>' + escapeHTML(req.userName) + '</strong></div>' +
          '<div class="review-card-detail"><span>User ID</span><strong>' + escapeHTML(req.userId) + '</strong></div>' +
          '<div class="review-card-detail"><span>Email</span><strong>' + escapeHTML(req.userEmail) + '</strong></div>' +
          '<div class="review-card-detail"><span>Phone</span><strong>' + escapeHTML(req.userPhone) + '</strong></div>' +
          '<div class="review-card-detail"><span>Submitted</span><strong>' + escapeHTML(date) + '</strong></div>' +
          '<div class="review-card-detail"><span>Filename</span><strong>' + escapeHTML(req.screenshotFilename) + '</strong></div>' +
        '</div>' +
      '</div>' +
      (isPending ?
        '<div class="review-card-actions">' +
          '<textarea class="review-notes-input" id="notes-' + escapeHTML(req.requestId) + '" placeholder="Admin notes (optional)...">' + escapeHTML(req.adminNotes || '') + '</textarea>' +
          '<div class="review-action-buttons">' +
            '<button class="btn-approve" type="button" data-approve-payment="' + req.requestId + '">\u2713 Approve</button>' +
            '<button class="btn-reject" type="button" data-reject-payment="' + req.requestId + '">\u2715 Reject</button>' +
          '</div>' +
        '</div>'
      :
        '<div class="review-card-actions">' +
          (req.adminNotes ? '<div class="admin-remark">Admin: ' + escapeHTML(req.adminNotes) + '</div>' : '') +
          (req.reviewedAt ? '<span style="color:var(--muted);font-size:0.82rem">Reviewed: ' + new Date(req.reviewedAt).toLocaleString("en-IN") + '</span>' : '') +
        '</div>'
      ) +
    '</div>';
  }).join("");
}

function approvePayment(requestId) {
  if (!state.adminAuthenticated || !state.adminSession) {
    showToast("Unauthorized operation.");
    return;
  }
  var req = state.paymentRequests.find(function(r) { return r.requestId === requestId; });
  if (!req || req.status !== "Pending Verification") return;

  var notesEl = document.getElementById("notes-" + requestId);
  var adminNotes = notesEl ? notesEl.value.trim() : "";
  var reviewedAt = new Date().toISOString();

  // Prepare updated copy
  var updatedReq = { ...req, status: "Approved", reviewedAt: reviewedAt, adminNotes: adminNotes };

  showToast("Processing approval...");

  syncToPaymentServer("approve", updatedReq)
    .then(function(res) {
      req.adminNotes = adminNotes;
      req.status = "Approved";
      req.reviewedAt = reviewedAt;
      if (res.filename) {
        req.screenshotFilename = res.filename;
      }

      applyAdminCredit("Approved deposit", req.amount, "Admin approved payment " + requestId + " for " + req.userName + ". UTR: " + req.utrNumber + ". Wallet credited " + rupees(req.amount) + ".");

      if (req.linkedRequestId) {
        var linked = state.requests.find(function(r) { return r.id === req.linkedRequestId; });
        if (linked) {
          linked.status = "Approved";
          state.requests = state.requests.filter(function(r) { return r.id !== req.linkedRequestId; });
        }
      }

      audit("Payment " + requestId + " APPROVED by " + (state.adminSession?.username || "Admin") + ". " + req.userName + " credited " + rupees(req.amount) + ". UTR: " + req.utrNumber + ".");
      renderAdminPayments();
      renderUserPayments();
      renderRequests();
      if (typeof saveStateToLocalStorage === "function") saveStateToLocalStorage();
      showToast("Payment " + requestId + " approved. " + rupees(req.amount) + " credited.");
    })
    .catch(function(err) {
      console.error("Approval failed:", err);
      showToast("Approval failed: " + err.message);
    });
}

function rejectPayment(requestId) {
  if (!state.adminAuthenticated || !state.adminSession) {
    showToast("Unauthorized operation.");
    return;
  }
  var req = state.paymentRequests.find(function(r) { return r.requestId === requestId; });
  if (!req || req.status !== "Pending Verification") return;

  var notesEl = document.getElementById("notes-" + requestId);
  var reason = notesEl ? notesEl.value.trim() : "";
  if (!reason) { showToast("Please provide a rejection reason in the notes field."); return; }

  var reviewedAt = new Date().toISOString();
  var updatedReq = { ...req, status: "Rejected", reviewedAt: reviewedAt, adminNotes: reason };

  showToast("Processing rejection...");

  syncToPaymentServer("reject", updatedReq)
    .then(function(res) {
      req.adminNotes = reason;
      req.status = "Rejected";
      req.reviewedAt = reviewedAt;
      if (res.filename) {
        req.screenshotFilename = res.filename;
      }

      if (req.linkedRequestId) {
        var linked = state.requests.find(function(r) { return r.id === req.linkedRequestId; });
        if (linked) {
          linked.status = "Rejected";
          state.requests = state.requests.filter(function(r) { return r.id !== req.linkedRequestId; });
        }
      }

      audit("Payment " + requestId + " REJECTED by " + (state.adminSession?.username || "Admin") + ". Reason: " + reason + ". No wallet change. UTR: " + req.utrNumber + ".");
      renderAdminPayments();
      renderUserPayments();
      renderRequests();
      if (typeof saveStateToLocalStorage === "function") saveStateToLocalStorage();
      showToast("Payment " + requestId + " rejected. Reason logged.");
    })
    .catch(function(err) {
      console.error("Rejection failed:", err);
      showToast("Rejection failed: " + err.message);
    });
}

// --------------- QR Code Management ---------------
function renderQRConfig() {
  var preview = document.getElementById("qrAdminPreview");
  if (!preview) return;
  if (state.qrConfig.imageData) {
    preview.innerHTML =
      '<img src="' + safeDataUrl(state.qrConfig.imageData) + '" alt="QR Code">' +
      '<div class="qr-status-badge ' + (state.qrConfig.enabled ? "active" : "inactive") + '">' +
        (state.qrConfig.enabled ? "\u25CF Active" : "\u25CB Disabled") +
      '</div>' +
      (state.qrConfig.uploadedAt ? '<p style="color:var(--muted);font-size:0.78rem;margin-top:8px">Updated: ' + new Date(state.qrConfig.uploadedAt).toLocaleString("en-IN") + '</p>' : '');
  } else {
    preview.innerHTML = '<div class="empty-state"><div class="empty-state-icon">\uD83D\uDCF1</div><span>No QR code uploaded yet</span></div>';
  }
  var toggle = document.getElementById("qrEnabledToggle");
  if (toggle) toggle.checked = state.qrConfig.enabled;
  var upiInput = document.getElementById("qrUpiId");
  if (upiInput && !upiInput.value && state.qrConfig.upiId) upiInput.value = state.qrConfig.upiId;
}

function saveQRConfig() {
  if (!state.adminAuthenticated || !state.adminSession) {
    showToast("Unauthorized operation.");
    return;
  }
  var fileInput = document.getElementById("qrUploadInput");
  var upiId = (document.getElementById("qrUpiId").value || "").trim();
  var enabled = document.getElementById("qrEnabledToggle").checked;

  state.qrConfig.upiId = upiId;
  state.qrConfig.enabled = enabled;

  if (fileInput.files && fileInput.files[0]) {
    var reader = new FileReader();
    reader.onload = function(e) {
      state.qrConfig.imageData = e.target.result;
      state.qrConfig.uploadedAt = new Date().toISOString();
      audit("Admin updated QR config: UPI: " + upiId + ". Status: " + (enabled ? "Active" : "Disabled") + ".");
      renderQRConfig();
      showToast("QR code updated.");
      if (typeof saveStateToLocalStorage === "function") saveStateToLocalStorage();
    };
    reader.readAsDataURL(fileInput.files[0]);
  } else {
    audit("Admin updated QR config. UPI: " + upiId + ". Status: " + (enabled ? "Active" : "Disabled") + ".");
    renderQRConfig();
    showToast("QR configuration saved.");
    if (typeof saveStateToLocalStorage === "function") saveStateToLocalStorage();
  }
}

// --------------- Screenshot Lightbox ---------------
function openScreenshotLightbox(src) {
  var lb = document.getElementById("screenshotLightbox");
  var img = document.getElementById("lightboxImage");
  if (lb && img) { img.src = src; state._lightboxSrc = src; lb.classList.add("active"); }
}

function closeScreenshotLightbox() {
  var lb = document.getElementById("screenshotLightbox");
  if (lb) lb.classList.remove("active");
}

function downloadScreenshotById(requestId) {
  var req = state.paymentRequests.find(function(r) { return r.requestId === requestId; });
  if (!req) return;
  var a = document.createElement("a");
  a.href = getScreenshotUrl(req);
  a.download = req.screenshotFilename;
  a.click();
}

function downloadLightboxImage() {
  if (!state._lightboxSrc) return;
  var a = document.createElement("a");
  a.href = state._lightboxSrc;
  a.download = "screenshot.jpg";
  a.click();
}

function syncToPaymentServer(action, data) {
  var headers = { "Content-Type": "application/json" };
  if (state.adminSession && state.adminSession.authHeader) {
    headers["Authorization"] = state.adminSession.authHeader;
  }
  // Send copy of data but delete heavy screenshotData if not submit
  var payload = { ...data };
  if (action !== 'submit') {
    delete payload.screenshotData;
  }
  return fetch("http://localhost:4400/api/payment", {
    method: "POST",
    headers: headers,
    body: JSON.stringify({ action: action, data: payload })
  })
  .then(function(res) {
    if (!res.ok) {
      return res.json().then(function(errJson) {
        throw new Error(errJson.error || "Server error (" + res.status + ")");
      }).catch(function() {
        throw new Error("Server error (" + res.status + ")");
      });
    }
    return res.json();
  })
  .catch(function(err) {
    if (err.message && (err.message.indexOf("Server error") !== -1 || err.message === "Invalid credentials" || err.message === "Unauthorized administrative operation")) {
      throw err;
    }
    throw new Error("Could not connect to payment server. Please ensure the server is running.");
  });
}

// --------------- Event Delegation ---------------
document.addEventListener("click", function(e) {
  // Deposit presets
  var preset = e.target.closest("[data-deposit-amount]");
  if (preset) {
    var input = document.getElementById("depositAmount");
    if (input) input.value = preset.dataset.depositAmount;
    return;
  }

  // Deposit wizard navigation
  if (e.target.closest("#depositNext1")) {
    var amt = Number(document.getElementById("depositAmount").value);
    if (!Number.isFinite(amt) || amt < 10) { showToast("Minimum deposit is \u20b910."); return; }
    advanceDepositStep(2);
    return;
  }
  if (e.target.closest("#depositNext2")) { advanceDepositStep(3); return; }
  if (e.target.closest("#submitPayment")) { submitPaymentRequest(); return; }
  if (e.target.closest("#newDeposit")) {
    state.depositStep = 1;
    renderDepositWizard();
    var utr = document.getElementById("utrInput"); if (utr) utr.value = "";
    var sc = document.getElementById("screenshotPreviewContainer"); if (sc) { sc.innerHTML = ""; sc.classList.remove("has-image"); }
    return;
  }
  var backBtn = e.target.closest("[data-deposit-back]");
  if (backBtn) { advanceDepositStep(Number(backBtn.dataset.depositBack)); return; }

  // Payment approval
  var approveBtn = e.target.closest("[data-approve-payment]");
  if (approveBtn) { approvePayment(approveBtn.dataset.approvePayment); return; }
  var rejectBtn = e.target.closest("[data-reject-payment]");
  if (rejectBtn) { rejectPayment(rejectBtn.dataset.rejectPayment); return; }

  // QR config
  if (e.target.closest("#saveQRConfig")) { saveQRConfig(); return; }

  // Screenshot zoom / download
  var zoomBtn = e.target.closest("[data-zoom-screenshot]");
  if (zoomBtn) {
    var r = state.paymentRequests.find(function(p) { return p.requestId === zoomBtn.dataset.zoomScreenshot; });
    if (r) openScreenshotLightbox(getScreenshotUrl(r));
    return;
  }
  var dlBtn = e.target.closest("[data-download-screenshot]");
  if (dlBtn) { downloadScreenshotById(dlBtn.dataset.downloadScreenshot); return; }

  // Lightbox image click
  var lbImg = e.target.closest("[data-lightbox-src]");
  if (lbImg) { openScreenshotLightbox(lbImg.dataset.lightboxSrc); return; }

  // Lightbox close
  if (e.target.closest("#lightboxClose")) { closeScreenshotLightbox(); return; }
  if (e.target.closest("#lightboxDownload")) { downloadLightboxImage(); return; }
  if (e.target.id === "screenshotLightbox") { closeScreenshotLightbox(); return; }

  // Payment filter tabs
  var filterTab = e.target.closest("[data-payment-filter]");
  if (filterTab) {
    state.paymentFilterStatus = filterTab.dataset.paymentFilter;
    document.querySelectorAll(".payment-tab").forEach(function(t) { t.classList.toggle("active", t === filterTab); });
    renderAdminPayments();
    return;
  }
});

// Payment search
var paymentSearch = document.getElementById("paymentSearchInput");
if (paymentSearch) {
  paymentSearch.addEventListener("input", function() {
    state.paymentSearchQuery = this.value.trim();
    renderAdminPayments();
  });
}

// Screenshot preview on file select
var screenshotInput = document.getElementById("screenshotInput");
if (screenshotInput) {
  screenshotInput.addEventListener("change", function() {
    var container = document.getElementById("screenshotPreviewContainer");
    if (!container) return;
    if (this.files && this.files[0]) {
      var reader = new FileReader();
      reader.onload = function(e) {
        container.innerHTML = '<img class="screenshot-thumb" src="' + safeDataUrl(e.target.result) + '" alt="Preview">';
        container.classList.add("has-image");
      };
      reader.readAsDataURL(this.files[0]);
    } else {
      container.innerHTML = "";
      container.classList.remove("has-image");
    }
  });
}

// --------------- Initialize ---------------
function loadPaymentsFromServer() {
  var url = "http://localhost:4400/api/payments";
  var headers = {};
  
  if (state.adminSession && state.adminSession.authHeader) {
    headers["Authorization"] = state.adminSession.authHeader;
  } else {
    url += "?userId=" + encodeURIComponent(state.currentUser.id);
  }

  fetch(url, { headers: headers })
    .then(function(res) {
      if (res.status === 401) {
        throw new Error("Unauthorized to load payments");
      }
      return res.json();
    })
    .then(function(res) {
      if (res.success && res.payments) {
        state.paymentRequests = res.payments;
        state.usedUTRs = res.payments.map(function(p) { return p.utrNumber; });
        state.screenshotHashes = res.payments.map(function(p) { return p.screenshotHash; });
        
        renderUserPayments();
        if (state.adminAuthenticated) renderAdminPayments();
      }
    })
    .catch(function(err) {
      console.warn("Could not sync payments from server:", err);
    });
}

renderDepositWizard();
renderUserPayments();
loadPaymentsFromServer();
