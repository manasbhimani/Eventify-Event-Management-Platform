
const events = [
    {
        id: 1,
        title: "Future of Technology Summit",
        category: "Technology",
        date: "2027-01-15",
        city: "Surat",
        venue: "Innovation Hall",
        price: 199,
        image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 2,
        title: "Live Music Night",
        category: "Music",
        date: "2027-01-22",
        city: "Ahmedabad",
        venue: "City Auditorium",
        price: 499,
        image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 3,
        title: "Creative Design Workshop",
        category: "Workshop",
        date: "2027-02-05",
        city: "Surat",
        venue: "Creative Studio",
        price: 299,
        image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 4,
        title: "Startup Networking Meetup",
        category: "Business",
        date: "2027-02-12",
        city: "Vadodara",
        venue: "Business Hub",
        price: 0,
        image: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 5,
        title: "Community Sports Day",
        category: "Sports",
        date: "2027-02-20",
        city: "Surat",
        venue: "Sports Complex",
        price: 149,
        image: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 6,
        title: "Web Development Bootcamp",
        category: "Technology",
        date: "2027-03-06",
        city: "Ahmedabad",
        venue: "Learning Centre",
        price: 399,
        image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80"
    }
];

const grid = document.getElementById("event-grid");
const searchInput = document.getElementById("search-input");
const searchForm = document.getElementById("search-form");
const resultsCount = document.getElementById("results-count");
const categoryButtons = document.querySelectorAll(".category");

let selectedCategory = "All";

function formatDate(dateString) {
    return new Date(dateString + "T12:00:00").toLocaleDateString(
        "en-IN",
        {
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    );
}

function renderEvents() {
    const query = searchInput.value.trim().toLowerCase();

    const filteredEvents = events.filter(event => {
        const matchesCategory =
            selectedCategory === "All" ||
            event.category === selectedCategory;

        const searchableText = [
            event.title,
            event.category,
            event.city,
            event.venue
        ].join(" ").toLowerCase();

        return matchesCategory && searchableText.includes(query);
    });

    resultsCount.textContent =
        `${filteredEvents.length} event${filteredEvents.length === 1 ? "" : "s"}`;

    if (filteredEvents.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <h3>No events found</h3>
                <p>Try another search or select a different category.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filteredEvents.map(event => `
        <article class="event-card">
            <div
                class="event-image"
                role="img"
                aria-label="${event.title}"
                style="background-image: url('${event.image}')"
            >
                <span class="event-tag">${event.category}</span>
            </div>

            <div class="event-info">
                <p class="event-date">${formatDate(event.date)}</p>
                <h3>${event.title}</h3>
                <p class="event-location">
                    ${event.venue} · ${event.city}
                </p>

                <div class="event-bottom">
                    <p class="event-price">
                        ${event.price === 0 ? "Free" : "₹" + event.price}
                        <small>per ticket</small>
                    </p>
                    <a class="btn btn-primary"
                       href="event.html?id=${event.id}">
                        View event ↗
                    </a>
                </div>
            </div>
        </article>
    `).join("");
}

categoryButtons.forEach(button => {
    button.addEventListener("click", () => {
        selectedCategory = button.dataset.category;

        categoryButtons.forEach(item => {
            const isActive = item === button;
            item.classList.toggle("active", isActive);
            item.setAttribute("aria-pressed", String(isActive));
        });

        renderEvents();
    });
});

searchForm.addEventListener("submit", event => {
    event.preventDefault();
    renderEvents();
});

searchInput.addEventListener("input", renderEvents);

renderEvents();
