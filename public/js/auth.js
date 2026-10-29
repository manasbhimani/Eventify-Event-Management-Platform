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

    // Helper: extract query parameters (e.g. ?redirect=/bookings.html)
    function getRedirectUrl() {
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get("redirect");
        // Ensure redirect is safe (relative URL starting with / or an html file)
        if (redirect && (redirect.startsWith("/") || redirect.endsWith(".html"))) {
            return redirect;
        }
        return "index.html";
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
