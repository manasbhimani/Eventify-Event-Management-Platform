/**
 * public/js/nav.js
 *
 * Eventify — Navigation Authentication State Synchronizer
 * Automatically checks auth state via window.api.getMe() and dynamically
 * updates navigation links, user identity badge, and logout action across all pages.
 */

(function () {
    "use strict";

    function escapeText(str) {
        const div = document.createElement("div");
        div.textContent = str || "";
        return div.innerHTML;
    }

    async function syncNavigation() {
        if (!window.api || typeof window.api.getMe !== "function") return;

        let currentUser = null;
        try {
            const res = await window.api.getMe();
            if (res && res.success && res.user) {
                currentUser = res.user;
            }
        } catch (_) {
            currentUser = null;
        }

        const navActions = document.querySelector(".nav-actions");
        const navLinks = document.querySelector(".nav-links");

        if (currentUser) {
            // Standardize navigation links for authenticated users
            if (navLinks) {
                // Ensure My Bookings link is present
                if (!navLinks.querySelector('a[href="bookings.html"]')) {
                    const bookingsLink = document.createElement("a");
                    bookingsLink.href = "bookings.html";
                    bookingsLink.textContent = "My Bookings";
                    navLinks.appendChild(bookingsLink);
                }

                // Add Organizer link for ORGANIZER and ADMIN
                if (currentUser.role === "ORGANIZER" || currentUser.role === "ADMIN") {
                    if (!navLinks.querySelector('a[href="organizer.html"]')) {
                        const orgLink = document.createElement("a");
                        orgLink.href = "organizer.html";
                        orgLink.textContent = "Organizer";
                        navLinks.appendChild(orgLink);
                    }
                }

                // Add Admin link for ADMIN
                if (currentUser.role === "ADMIN") {
                    if (!navLinks.querySelector('a[href="admin.html"]')) {
                        const adminLink = document.createElement("a");
                        adminLink.href = "admin.html";
                        adminLink.textContent = "Admin";
                        navLinks.appendChild(adminLink);
                    }
                }

                // If any stray login links exist in navLinks, remove them
                const strayLoginLink = navLinks.querySelector('a[href="login.html"]');
                if (strayLoginLink) {
                    strayLoginLink.remove();
                }
            }

            // User identity & logout action using CSS classes (no injected inline styles)
            const roleClass = (currentUser.role || "").toLowerCase();
            const userMarkup = `
                <span class="nav-user-info">
                    <span>Hi, <strong class="nav-user-name">${escapeText(currentUser.name)}</strong></span>
                    <span class="role-badge ${roleClass}">${escapeText(currentUser.role)}</span>
                </span>
                <button type="button" id="nav-logout-btn" class="nav-logout-btn" aria-label="Log out of Eventify">
                    Log out
                </button>
            `;

            if (navActions) {
                navActions.innerHTML = userMarkup;
            } else if (navLinks) {
                const container = document.createElement("div");
                container.className = "nav-actions";
                container.innerHTML = userMarkup;
                navLinks.parentNode.insertBefore(container, navLinks.nextSibling);
            }

            const logoutBtn = document.getElementById("nav-logout-btn");
            if (logoutBtn) {
                logoutBtn.addEventListener("click", async () => {
                    try {
                        logoutBtn.disabled = true;
                        logoutBtn.textContent = "Logging out...";
                        await window.api.logout();
                    } finally {
                        window.location.href = "index.html";
                    }
                });
            }

            // Check and display any persistent attendee notifications
            initAttendeeNotifications(currentUser);
        }
    }

    // =======================================================================
    // ATTENDEE NOTIFICATION POPUP DIALOG
    // =======================================================================

    async function initAttendeeNotifications(currentUser) {
        if (!currentUser || !window.api || typeof window.api.getNotifications !== "function") return;

        try {
            const res = await window.api.getNotifications({ status: "UNREAD" });
            if (!res || !res.success || !Array.isArray(res.data) || res.data.length === 0) {
                return;
            }

            const cancelNotifs = res.data.filter(n => n.type === "EVENT_CANCELLED");
            if (cancelNotifs.length === 0) return;

            renderNotificationModal(cancelNotifs);
        } catch (err) {
            console.error("[Nav] Failed to load attendee notifications:", err);
        }
    }

    function renderNotificationModal(notifs) {
        // Prevent duplicate modals if already open
        const existing = document.getElementById("attendee-notif-backdrop");
        if (existing) existing.remove();

        let currentIndex = 0;

        const backdrop = document.createElement("div");
        backdrop.id = "attendee-notif-backdrop";
        backdrop.className = "attendee-modal-backdrop";

        const dialog = document.createElement("div");
        dialog.className = "attendee-modal-dialog";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-labelledby", "notif-dialog-heading");

        // Header
        const header = document.createElement("div");
        header.className = "attendee-modal-header";

        const titleGroup = document.createElement("div");
        const heading = document.createElement("h2");
        heading.id = "notif-dialog-heading";
        heading.className = "attendee-modal-heading";
        heading.textContent = "⚠️ Event Cancellation Notice";
        titleGroup.appendChild(heading);

        const counterSpan = document.createElement("span");
        counterSpan.className = "attendee-modal-counter";
        titleGroup.appendChild(counterSpan);

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "attendee-modal-close";
        closeBtn.setAttribute("aria-label", "Close notification dialog");
        closeBtn.textContent = "✕";

        header.appendChild(titleGroup);
        header.appendChild(closeBtn);

        // Body
        const body = document.createElement("div");
        body.className = "attendee-modal-body";

        const eventTitleEl = document.createElement("h3");
        eventTitleEl.className = "notif-event-title";

        const bookingRefEl = document.createElement("p");
        bookingRefEl.className = "notif-booking-ref";

        const messageEl = document.createElement("p");
        messageEl.className = "notif-message-text";

        const refundBox = document.createElement("div");
        refundBox.className = "notif-refund-box";

        const refundIcon = document.createElement("span");
        refundIcon.className = "notif-refund-icon";

        const refundContent = document.createElement("div");
        const refundTitle = document.createElement("p");
        refundTitle.className = "notif-refund-title";
        const refundDesc = document.createElement("p");
        refundDesc.className = "notif-refund-desc";

        refundContent.appendChild(refundTitle);
        refundContent.appendChild(refundDesc);
        refundBox.appendChild(refundIcon);
        refundBox.appendChild(refundContent);

        body.appendChild(eventTitleEl);
        body.appendChild(bookingRefEl);
        body.appendChild(messageEl);
        body.appendChild(refundBox);

        // Actions
        const actions = document.createElement("div");
        actions.className = "attendee-modal-actions";

        const pagerGroup = document.createElement("div");
        pagerGroup.className = "notif-pager";

        const prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.className = "notif-page-btn";
        prevBtn.textContent = "← Previous";

        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "notif-page-btn";
        nextBtn.textContent = "Next →";

        pagerGroup.appendChild(prevBtn);
        pagerGroup.appendChild(nextBtn);

        const dismissBtn = document.createElement("button");
        dismissBtn.type = "button";
        dismissBtn.className = "notif-dismiss-btn";
        dismissBtn.textContent = "Acknowledge & Dismiss";

        actions.appendChild(pagerGroup);
        actions.appendChild(dismissBtn);

        dialog.appendChild(header);
        dialog.appendChild(body);
        dialog.appendChild(actions);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        function updateView() {
            if (notifs.length === 0) {
                backdrop.remove();
                return;
            }

            if (currentIndex < 0) currentIndex = 0;
            if (currentIndex >= notifs.length) currentIndex = notifs.length - 1;

            const current = notifs[currentIndex];

            // Counter
            if (notifs.length > 1) {
                counterSpan.textContent = `Notification ${currentIndex + 1} of ${notifs.length}`;
                counterSpan.style.display = "inline-block";
                pagerGroup.style.display = "flex";
                prevBtn.disabled = (currentIndex === 0);
                nextBtn.disabled = (currentIndex === notifs.length - 1);
            } else {
                counterSpan.style.display = "none";
                pagerGroup.style.display = "none";
            }

            // Details
            eventTitleEl.textContent = current.eventTitle || current.title || "Cancelled Event";
            bookingRefEl.textContent = current.bookingId
                ? `Booking Reference: ${current.bookingId}`
                : "Booking Reference: General Reservation";
            messageEl.textContent = current.message || "This event was cancelled by the organizer.";

            // Refund presentation
            const hasRefund = current.refund && Number(current.refund.amount) > 0;
            if (hasRefund) {
                refundBox.className = "notif-refund-box paid";
                refundIcon.textContent = "💳";
                refundTitle.textContent = `Simulated Refund: ₹${Number(current.refund.amount).toLocaleString("en-IN")}`;
                refundDesc.textContent = "Simulated refund recorded — no real money was transferred.";
            } else {
                refundBox.className = "notif-refund-box free";
                refundIcon.textContent = "ℹ️";
                refundTitle.textContent = "Free Reservation Cancelled";
                refundDesc.textContent = "No payment was collected; your reservation was cancelled without charge.";
            }

            dismissBtn.disabled = false;
            dismissBtn.textContent = "Acknowledge & Dismiss";
        }

        prevBtn.addEventListener("click", () => {
            if (currentIndex > 0) {
                currentIndex--;
                updateView();
            }
        });

        nextBtn.addEventListener("click", () => {
            if (currentIndex < notifs.length - 1) {
                currentIndex++;
                updateView();
            }
        });

        closeBtn.addEventListener("click", () => {
            backdrop.remove();
        });

        dismissBtn.addEventListener("click", async () => {
            const current = notifs[currentIndex];
            if (!current) return;

            dismissBtn.disabled = true;
            dismissBtn.textContent = "Dismissing...";

            try {
                await window.api.dismissNotification(current.id);
                notifs.splice(currentIndex, 1);
                if (currentIndex >= notifs.length && currentIndex > 0) {
                    currentIndex--;
                }
                updateView();
            } catch (err) {
                console.error("[Nav] Failed to dismiss notification:", err);
                dismissBtn.disabled = false;
                dismissBtn.textContent = "Acknowledge & Dismiss";
            }
        });

        updateView();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", syncNavigation);
    } else {
        syncNavigation();
    }
})();
