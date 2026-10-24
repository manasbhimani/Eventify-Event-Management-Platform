
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const email = document.getElementById("login-email").value.trim();
        const password = document.getElementById("login-password").value;
        const message = document.getElementById("login-message");

        if (!email || !password) {
            message.textContent = "Please fill in all fields.";
            return;
        }

        message.textContent =
            "Demo only: login will work after backend integration.";
    });
}

if (registerForm) {
    registerForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const name = document.getElementById("register-name").value.trim();
        const email = document.getElementById("register-email").value.trim();
        const password = document.getElementById("register-password").value;
        const confirmPassword =
            document.getElementById("register-confirm-password").value;
        const role = document.getElementById("register-role").value;
        const message = document.getElementById("register-message");

        if (name.length < 2) {
            message.textContent = "Please enter your full name.";
            return;
        }

        if (password.length < 8) {
            message.textContent =
                "Password must contain at least 8 characters.";
            return;
        }

        if (password !== confirmPassword) {
            message.textContent = "Passwords do not match.";
            return;
        }

        message.textContent =
            "Demo only: " + role.toLowerCase() +
            " registration will work after backend integration.";
    });
}
