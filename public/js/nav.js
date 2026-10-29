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
            // Add role-specific navigation links if appropriate
            if (navLinks) {
                if (currentUser.role === "ORGANIZER" || currentUser.role === "ADMIN") {
                    if (!navLinks.querySelector('a[href="organizer.html"]')) {
                        const orgLink = document.createElement("a");
                        orgLink.href = "organizer.html";
                        orgLink.textContent = "Organizer";
                        navLinks.appendChild(orgLink);
                    }
                }
                if (currentUser.role === "ADMIN") {
                    if (!navLinks.querySelector('a[href="admin.html"]')) {
                        const adminLink = document.createElement("a");
                        adminLink.href = "admin.html";
                        adminLink.textContent = "Admin";
                        navLinks.appendChild(adminLink);
                    }
                }
            }

            // User identity & logout action
            const userMarkup = `
                <span class="nav-user-info" style="display:inline-flex;align-items:center;gap:8px;font-size:13px;color:#a1a5bb;">
                    <span>Hi, <strong style="color:#f4f4fb;">${escapeText(currentUser.name)}</strong></span>
                    <span class="role-badge" style="background:rgba(167,139,250,0.18);color:#a78bfa;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;">${currentUser.role}</span>
                </span>
                <button type="button" id="nav-logout-btn" class="btn" style="background:transparent;color:#a1a5bb;border:1px solid #292c40;padding:6px 14px;font-size:13px;cursor:pointer;border-radius:8px;">
                    Log out
                </button>
            `;

            if (navActions) {
                navActions.innerHTML = userMarkup;
            } else if (navLinks) {
                const loginLink = navLinks.querySelector('a[href="login.html"]');
                if (loginLink) {
                    const container = document.createElement("div");
                    container.className = "nav-actions";
                    container.style.display = "inline-flex";
                    container.style.alignItems = "center";
                    container.style.gap = "14px";
                    container.innerHTML = userMarkup;
                    loginLink.replaceWith(container);
                }
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
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", syncNavigation);
    } else {
        syncNavigation();
    }
})();
