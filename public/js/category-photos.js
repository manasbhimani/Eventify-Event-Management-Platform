/**
 * public/js/category-photos.js
 *
 * Eventify — Category Photo Registry & Deterministic Photo Resolver
 *
 * Provides a curated collection of category-appropriate sample photos for all six
 * event categories (Technology, Music, Workshop, Business, Sports, Conference)
 * and deterministically assigns fallback images for events lacking custom photos.
 */

(function () {
    "use strict";

    // Known legacy generic auditorium placeholder URL pattern
    const GENERIC_DEFAULT_IMAGE_ID = "photo-1540575467063-178a50c2df87";

    /**
     * Category photo inventory: at least 4 distinct, theme-appropriate local photos per category.
     */
    const CATEGORY_PHOTOS = {
        technology: [
            "/images/categories/technology/technology-1.jpg",
            "/images/categories/technology/technology-2.jpg",
            "/images/categories/technology/technology-3.jpg",
            "/images/categories/technology/technology-4.jpg"
        ],
        music: [
            "/images/categories/music/music-1.jpg",
            "/images/categories/music/music-2.jpg",
            "/images/categories/music/music-3.jpg",
            "/images/categories/music/music-4.jpg"
        ],
        workshop: [
            "/images/categories/workshop/workshop-1.jpg",
            "/images/categories/workshop/workshop-2.jpg",
            "/images/categories/workshop/workshop-3.jpg",
            "/images/categories/workshop/workshop-4.jpg"
        ],
        business: [
            "/images/categories/business/business-1.jpg",
            "/images/categories/business/business-2.jpg",
            "/images/categories/business/business-3.jpg",
            "/images/categories/business/business-4.jpg"
        ],
        sports: [
            "/images/categories/sports/sports-1.jpg",
            "/images/categories/sports/sports-2.jpg",
            "/images/categories/sports/sports-3.jpg",
            "/images/categories/sports/sports-4.jpg"
        ],
        conference: [
            "/images/categories/conference/conference-1.jpg",
            "/images/categories/conference/conference-2.jpg",
            "/images/categories/conference/conference-3.jpg",
            "/images/categories/conference/conference-4.jpg"
        ]
    };

    /**
     * Verified royalty-free external backup URLs corresponding to the local assets.
     */
    const EXTERNAL_BACKUPS = {
        technology: [
            "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80"
        ],
        music: [
            "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=800&q=80"
        ],
        workshop: [
            "https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80"
        ],
        business: [
            "https://images.unsplash.com/photo-1515187029135-18ee286d815b?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80"
        ],
        sports: [
            "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=800&q=80"
        ],
        conference: [
            "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=800&q=80"
        ]
    };

    /**
     * Compute a stable 32-bit positive hash from a string.
     * @param {string} str
     * @returns {number}
     */
    function hashString(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    /**
     * Safely normalize category names to match registry keys.
     * @param {string|null|undefined} category
     * @returns {string}
     */
    function normalizeCategory(category) {
        if (!category || typeof category !== "string") return "conference";
        const cleaned = category.trim().toLowerCase();
        if (cleaned.includes("tech")) return "technology";
        if (cleaned.includes("music")) return "music";
        if (cleaned.includes("work")) return "workshop";
        if (cleaned.includes("busin")) return "business";
        if (cleaned.includes("sport") || cleaned.includes("fit")) return "sports";
        if (cleaned.includes("conf") || cleaned.includes("meet")) return "conference";
        return cleaned;
    }

    /**
     * Sanitize image URLs to prevent javascript: or malformed CSS injection.
     * @param {string|null|undefined} url
     * @returns {string}
     */
    function sanitizeImageUrl(url) {
        if (!url || typeof url !== "string") return "";
        const trimmed = url.trim();
        if (/^(https?:\/\/|\/|\.\/)/i.test(trimmed)) {
            return trimmed.replace(/['"()]/g, "");
        }
        return "";
    }

    /**
     * Deterministically resolves the appropriate photo URL for an event.
     *
     * Rules:
     * 1. If the event has a valid custom image that is NOT the generic default, use it.
     * 2. If the image is missing, invalid, or is the generic default, select a category photo.
     * 3. Selection is deterministic (stable across reloads, searches, and navigation).
     * 4. Different events within the same category receive varied photos when possible.
     *
     * @param {Object} event
     * @returns {string} Safe image URL
     */
    function getEventImageUrl(event) {
        if (!event) return CATEGORY_PHOTOS.conference[0];

        const rawImage = event.image || event.image_url;
        const safeCustom = sanitizeImageUrl(rawImage);

        // 1. If custom image exists and is NOT the generic default, use it
        if (safeCustom && !safeCustom.includes(GENERIC_DEFAULT_IMAGE_ID)) {
            return safeCustom;
        }

        // 2. Select category-specific fallback
        const normalizedCat = normalizeCategory(event.category);
        const photoList = CATEGORY_PHOTOS[normalizedCat] || CATEGORY_PHOTOS.conference;

        // Deterministic seed based on numeric event ID or string hash fallback
        let seed;
        if (event.id != null && !isNaN(Number(event.id))) {
            seed = Math.abs(Number(event.id));
        } else {
            const titlePart = (event.title || "").trim().toLowerCase();
            seed = hashString(`${titlePart}_${normalizedCat}`);
        }

        const index = seed % photoList.length;
        return photoList[index];
    }

    // Expose on global window object and window.api if present
    const root = typeof window !== "undefined" ? window : globalThis;
    root.CATEGORY_PHOTOS = CATEGORY_PHOTOS;
    root.EXTERNAL_BACKUPS = EXTERNAL_BACKUPS;
    root.getEventImageUrl = getEventImageUrl;
    root.normalizeCategory = normalizeCategory;

    if (root.api && typeof root.api === "object") {
        root.api.getEventImageUrl = getEventImageUrl;
        root.api.CATEGORY_PHOTOS = CATEGORY_PHOTOS;
    }
})();
