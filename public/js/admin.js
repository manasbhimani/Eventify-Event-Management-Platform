
const demoUsers = [
    {
        id: 1,
        name: "Admin User",
        email: "admin@example.com",
        role: "ADMIN",
        status: "ACTIVE"
    },
    {
        id: 2,
        name: "Priya Sharma",
        email: "priya@example.com",
        role: "ORGANIZER",
        status: "ACTIVE"
    },
    {
        id: 3,
        name: "Rahul Patel",
        email: "rahul@example.com",
        role: "ATTENDEE",
        status: "ACTIVE"
    },
    {
        id: 4,
        name: "Neha Shah",
        email: "neha@example.com",
        role: "ORGANIZER",
        status: "SUSPENDED"
    }
];

const demoEvents = [
    {
        id: 101,
        title: "Future of Technology Summit",
        organizer: "Priya Sharma",
        category: "Technology",
        date: "2027-01-15",
        status: "PUBLISHED"
    },
    {
        id: 102,
        title: "Creative Design Workshop",
        organizer: "Priya Sharma",
        category: "Workshop",
        date: "2027-02-10",
        status: "PUBLISHED"
    },
    {
        id: 103,
        title: "Startup Networking Meetup",
        organizer: "Neha Shah",
        category: "Business",
        date: "2027-03-20",
        status: "DRAFT"
    },
    {
        id: 104,
        title: "Community Music Night",
        organizer: "Neha Shah",
        category: "Music",
        date: "2027-04-12",
        status: "CANCELLED"
    }
];

const categories = [
    "Technology",
    "Music",
    "Workshop",
    "Business",
    "Sports"
];

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

function updateAdminStats() {
    document.getElementById("total-users").textContent =
        demoUsers.length;

    document.getElementById("total-events").textContent =
        demoEvents.length;

    document.getElementById("published-events").textContent =
        demoEvents.filter(event => event.status === "PUBLISHED").length;

    document.getElementById("total-categories").textContent =
        categories.length;
}

function renderUsers() {
    const searchText = document.getElementById("user-search")
        .value.trim().toLowerCase();

    const filteredUsers = demoUsers.filter(user => {
        return user.name.toLowerCase().includes(searchText) ||
            user.email.toLowerCase().includes(searchText) ||
            user.role.toLowerCase().includes(searchText);
    });

    const table = document.getElementById("users-table");

    if (filteredUsers.length === 0) {
        table.innerHTML = `
            <tr>
                <td colspan="5">No matching users found.</td>
            </tr>
        `;
        return;
    }

    table.innerHTML = filteredUsers.map(user => {
        const statusClass = user.status.toLowerCase();

        const action = user.role === "ADMIN"
            ? `<span>Protected</span>`
            : `<button class="admin-action"
                    data-user-action="toggle"
                    data-user-id="${user.id}">
                    ${user.status === "ACTIVE" ? "Suspend" : "Activate"}
               </button>`;

        return `
            <tr>
                <td class="user-name">${escapeHTML(user.name)}</td>
                <td class="user-email">${escapeHTML(user.email)}</td>
                <td><span class="role-badge">${escapeHTML(user.role)}</span></td>
                <td>
                    <span class="account-status ${statusClass}">
                        ${escapeHTML(user.status)}
                    </span>
                </td>
                <td>${action}</td>
            </tr>
        `;
    }).join("");
}

function renderAdminEvents() {
    const selectedStatus =
        document.getElementById("event-status-filter").value;

    const filteredEvents = demoEvents.filter(event => {
        return selectedStatus === "ALL" ||
            event.status === selectedStatus;
    });

    const container = document.getElementById("admin-events");

    if (filteredEvents.length === 0) {
        container.innerHTML = `
            <div class="empty-state">No events found for this filter.</div>
        `;
        return;
    }

    container.innerHTML = filteredEvents.map(event => {
        const statusClass = event.status.toLowerCase();

        let actions = "";

        if (event.status !== "PUBLISHED") {
            actions += `
                <button class="admin-action"
                    data-event-action="publish"
                    data-event-id="${event.id}">
                    Publish
                </button>
            `;
        }

        if (event.status !== "CANCELLED") {
            actions += `
                <button class="admin-action danger"
                    data-event-action="cancel"
                    data-event-id="${event.id}">
                    Cancel
                </button>
            `;
        }

        return `
            <article class="admin-event-card">
                <div class="admin-event-top">
                    <div>
                        <h3>${escapeHTML(event.title)}</h3>
                        <p>Organizer: ${escapeHTML(event.organizer)}</p>
                    </div>

                    <span class="event-status ${statusClass}">
                        ${escapeHTML(event.status)}
                    </span>
                </div>

                <p>Category: ${escapeHTML(event.category)}</p>
                <p>Date: ${escapeHTML(event.date)}</p>

                <div class="admin-event-actions">
                    ${actions}
                </div>
            </article>
        `;
    }).join("");
}

function renderCategories() {
    const list = document.getElementById("category-list");

    list.innerHTML = categories.map(category => `
        <div class="category-chip">
            <span>${escapeHTML(category)}</span>
            <button class="remove-category"
                data-category="${escapeHTML(category)}"
                aria-label="Remove ${escapeHTML(category)}"
                title="Remove category">×</button>
        </div>
    `).join("");
}

document.getElementById("user-search").addEventListener(
    "input",
    renderUsers
);

document.getElementById("event-status-filter").addEventListener(
    "change",
    renderAdminEvents
);

document.getElementById("users-table").addEventListener(
    "click",
    function (event) {
        const button = event.target.closest("[data-user-action]");

        if (!button) {
            return;
        }

        const userId = Number(button.dataset.userId);
        const user = demoUsers.find(item => item.id === userId);

        if (!user || user.role === "ADMIN") {
            return;
        }

        const newStatus = user.status === "ACTIVE"
            ? "SUSPENDED"
            : "ACTIVE";

        const confirmed = window.confirm(
            `${newStatus === "SUSPENDED" ? "Suspend" : "Activate"} ${user.name}?`
        );

        if (!confirmed) {
            return;
        }

        user.status = newStatus;

        renderUsers();
    }
);

document.getElementById("admin-events").addEventListener(
    "click",
    function (event) {
        const button = event.target.closest("[data-event-action]");

        if (!button) {
            return;
        }

        const eventId = Number(button.dataset.eventId);
        const action = button.dataset.eventAction;
        const selectedEvent = demoEvents.find(item => item.id === eventId);

        if (!selectedEvent) {
            return;
        }

        if (action === "publish") {
            selectedEvent.status = "PUBLISHED";
        } else if (action === "cancel") {
            const confirmed = window.confirm(
                `Cancel "${selectedEvent.title}"?`
            );

            if (!confirmed) {
                return;
            }

            selectedEvent.status = "CANCELLED";
        }

        updateAdminStats();
        renderAdminEvents();
    }
);

document.getElementById("category-form").addEventListener(
    "submit",
    function (event) {
        event.preventDefault();

        const input = document.getElementById("category-name");
        const message = document.getElementById("category-message");
        const category = input.value.trim();

        if (!category) {
            message.textContent = "Enter a category name.";
            return;
        }

        const exists = categories.some(
            item => item.toLowerCase() === category.toLowerCase()
        );

        if (exists) {
            message.textContent = "This category already exists.";
            return;
        }

        categories.push(category);
        input.value = "";

        message.textContent = "Demo category added successfully.";

        updateAdminStats();
        renderCategories();
    }
);

document.getElementById("category-list").addEventListener(
    "click",
    function (event) {
        const button = event.target.closest("[data-category]");

        if (!button) {
            return;
        }

        const category = button.dataset.category;

        const confirmed = window.confirm(
            `Remove the "${category}" category from the demo?`
        );

        if (!confirmed) {
            return;
        }

        const index = categories.findIndex(
            item => item === category
        );

        if (index !== -1) {
            categories.splice(index, 1);
        }

        document.getElementById("category-message").textContent =
            "Demo category removed.";

        updateAdminStats();
        renderCategories();
    }
);

updateAdminStats();
renderUsers();
renderAdminEvents();
renderCategories();
