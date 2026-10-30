/**
 * public/js/auth.js
 *
 * Eventify — Client-side authentication controller.
 * Connects login and registration forms to the backend API.
 */

(function () {
    "use strict";

    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");

    // Helper: safely extract and validate redirect destination query parameter.
    // Prevents open redirect attacks (e.g. //attacker.com, /\attacker.com, external domains).
    // Only allows safe, same-origin relative paths on http: or https:.
    function getRedirectUrl(customRedirect) {
        const DEFAULT_REDIRECT = "index.html";
        try {
            let redirect = customRedirect;
            if (redirect === undefined && typeof window !== "undefined" && window.location) {
                const params = new URLSearchParams(window.location.search);
                redirect = params.get("redirect");
            }

            if (!redirect || typeof redirect !== "string") {
                return DEFAULT_REDIRECT;
            }

            const trimmed = redirect.trim();
            if (!trimmed || trimmed === "null" || trimmed === "undefined") {
                return DEFAULT_REDIRECT;
            }

            // Decode URL components to block encoded backslash (%5C) or encoded double slash (%2F%2F) bypasses
            let decoded = trimmed;
            try {
                decoded = decodeURIComponent(trimmed);
            } catch (_) {
                return DEFAULT_REDIRECT;
            }

            // Reject backslashes (both literal and decoded)
            if (trimmed.includes("\\") || decoded.includes("\\")) {
                return DEFAULT_REDIRECT;
            }

            // Reject protocol-relative URLs starting with //
            if (trimmed.startsWith("//") || decoded.startsWith("//")) {
                return DEFAULT_REDIRECT;
            }

            // Reject control characters, newlines, or null bytes
            if (/[\x00-\x1F\x7F]/.test(decoded)) {
                return DEFAULT_REDIRECT;
            }

            // Resolve using WHATWG URL API against current origin
            const currentOrigin = (typeof window !== "undefined" && window.location && window.location.origin)
                ? window.location.origin
                : "http://localhost:3000";

            const parsed = new URL(trimmed, currentOrigin);

            // Strict same-origin validation: protocol and host must strictly match
            if (parsed.origin !== currentOrigin) {
                return DEFAULT_REDIRECT;
            }

            // Must use http: or https:
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
                return DEFAULT_REDIRECT;
            }

            // Pathname must begin with a single slash
            if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) {
                return DEFAULT_REDIRECT;
            }

            const relativeTarget = parsed.pathname + parsed.search + parsed.hash;
            if (relativeTarget === "/" || relativeTarget === "") {
                return DEFAULT_REDIRECT;
            }

            return relativeTarget;
        } catch (_) {
            return DEFAULT_REDIRECT;
        }
    }

    if (typeof window !== "undefined") {
        window.getRedirectUrl = getRedirectUrl;
    }

    // Helper: set message text and status color
    function setMessage(element, text, isError) {
        if (!element) return;
        element.textContent = text;
        element.style.color = isError ? "#f87171" : "#4ade80";
    }

    // =======================================================================
    // LOGIN FORM HANDLER
    // =======================================================================
    if (loginForm) {
        loginForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            const emailInput = document.getElementById("login-email");
            const passwordInput = document.getElementById("login-password");
            const messageEl = document.getElementById("login-message");
            const submitBtn = loginForm.querySelector("button[type='submit']");

            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (!email || !password) {
                setMessage(messageEl, "Please fill in all fields.", true);
                return;
            }

            const originalBtnText = submitBtn ? submitBtn.textContent : "Sign In →";
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Signing in...";
            }
            setMessage(messageEl, "", false);

            try {
                const response = await window.api.login(email, password);
                setMessage(messageEl, "Login successful! Redirecting...", false);

                setTimeout(() => {
                    window.location.href = getRedirectUrl();
                }, 600);
            } catch (err) {
                const msg = err.message || "Failed to log in. Please check your credentials.";
                setMessage(messageEl, msg, true);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                }
            }
        });
    }

    // =======================================================================
    // REGISTRATION FORM HANDLER
    // =======================================================================
    if (registerForm) {
        registerForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            const nameInput = document.getElementById("register-name");
            const emailInput = document.getElementById("register-email");
            const passwordInput = document.getElementById("register-password");
            const confirmInput = document.getElementById("register-confirm-password");
            const messageEl = document.getElementById("register-message");
            const submitBtn = registerForm.querySelector("button[type='submit']");

            const name = nameInput.value.trim();
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            const confirmPassword = confirmInput.value;

            if (name.length < 2) {
                setMessage(messageEl, "Please enter your full name (at least 2 characters).", true);
                return;
            }

            if (password.length < 8) {
                setMessage(messageEl, "Password must contain at least 8 characters.", true);
                return;
            }

            if (password !== confirmPassword) {
                setMessage(messageEl, "Passwords do not match.", true);
                return;
            }

            const originalBtnText = submitBtn ? submitBtn.textContent : "Create Account →";
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Creating account...";
            }
            setMessage(messageEl, "", false);

            try {
                // Public registration creates ATTENDEE accounts automatically
                await window.api.register(name, email, password);
                setMessage(messageEl, "Account created successfully! Redirecting...", false);

                setTimeout(() => {
                    window.location.href = getRedirectUrl();
                }, 600);
            } catch (err) {
                const msg = err.message || "Registration failed. Please try again.";
                setMessage(messageEl, msg, true);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                }
            }
        });
    }
})();
