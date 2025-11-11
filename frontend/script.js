
const API_BASE = "https://agentic-travel-guide-1.onrender.com";


const form = document.getElementById("planner-form");
const output = document.getElementById("output");
const loading = document.getElementById("loading");
const result = document.getElementById("result");
const controls = document.getElementById("controls");

const gallery = document.getElementById("gallery");
const galleryGrid = document.getElementById("gallery-grid");

const hotelSection = document.getElementById("hotels");
const hotelList = document.getElementById("hotel-list");

// 🌄 Update background according to destination
function updateBackground(city) {
  const query = encodeURIComponent(city + " landscape");
  document.querySelector(".bg").style.backgroundImage =
    `url("https://source.unsplash.com/1600x900/?${query}")`;
}

// 🖼️ Destination photos — inserted right after H1 title
async function renderGallery(city, count = 6) {
  galleryGrid.innerHTML = "";
  try {
    const res = await fetch(`${API_BASE}/images?destination=${encodeURIComponent(city)}&count=${count}`);
    const urls = await res.json();

    urls.forEach(url => {
      const img = document.createElement("img");
      img.src = url;
      img.loading = "lazy";
      img.alt = `${city} photo`;
      img.className = "gallery-img fade-in";
      galleryGrid.appendChild(img);
    });

    if (urls.length > 0) {
      gallery.classList.remove("hidden");

      const mainTitle = result.querySelector("h1");
      if (mainTitle) result.insertBefore(gallery, mainTitle.nextSibling);
      else result.prepend(gallery);
    }
  } catch (err) {
    console.error("Image load error:", err);
  }
}

// 🏨 Hotels — placed AFTER "Budget" and BEFORE "Safety Tips"
async function renderHotels(city) {
  hotelList.innerHTML = "";
  try {
    const res = await fetch(`${API_BASE}/hotels?destination=${encodeURIComponent(city)}&count=6`);
    const hotels = await res.json();

    hotels.forEach(h => {
      const card = document.createElement("div");
      card.className = "hotel-card fade-in";
      card.innerHTML = `
        <img src="${h.image}" alt="${h.name}">
        <div class="hotel-name">${h.name}</div>
        <div class="hotel-price">💰 ${h.price || ""}</div>
        <div class="hotel-rating">⭐ ${h.rating || ""}</div>
        <div class="hotel-description">${h.description || ""}</div>
      `;
      hotelList.appendChild(card);
    });

    // ✅ Correct placement logic
    const blocks = Array.from(result.children);

    let budgetIndex = blocks.findIndex(el => /budget/i.test(el.textContent));
    let safetyIndex = blocks.findIndex(el => /safety/i.test(el.textContent));

    if (budgetIndex !== -1) {
      if (safetyIndex !== -1 && safetyIndex > budgetIndex) {
        result.insertBefore(hotelSection, blocks[safetyIndex]);
      } else {
        result.insertBefore(hotelSection, blocks[budgetIndex + 1] || null);
      }
    } else {
      result.appendChild(hotelSection);
    }

    if (hotels.length > 0) hotelSection.classList.remove("hidden");

  } catch (err) {
    console.error("Hotel load error:", err);
  }
}

// 📝 Convert markdown into formatted HTML
function formatContent(markdown) {
  markdown = markdown.replace(/^\*\*(.+?)\*\*/m, "<h1>$1</h1>");

  let html = markdown
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    .replace(/^### (.*$)/gim, "<h3 class='day-title'>🌍 $1</h3>")
    .replace(/^\- (.*$)/gim, "✨ $1")
    .replace(/\n/g, "<br/>");

  setTimeout(() => {
    document.querySelectorAll(".day-title").forEach(day => {
      const block = [];
      let el = day.nextElementSibling;
      while (el && !el.classList.contains("day-title")) {
        block.push(el);
        el = el.nextElementSibling;
      }
      day.addEventListener("click", () => {
        block.forEach(x => x.classList.toggle("hidden"));
      });
    });
  }, 50);

  return html;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const from = document.getElementById("from").value.trim();
  const destination = document.getElementById("destination").value.trim();
  const start_date = document.getElementById("start-date").value;
  const end_date = document.getElementById("end-date").value;
  const interests = document.getElementById("interests").value.trim();

  if (!from || !destination || !start_date || !end_date) {
    alert("Please fill all fields.");
    return;
  }

  const days = Math.max(
    1,
    Math.ceil((new Date(end_date) - new Date(start_date)) / (1000 * 60 * 60 * 24))
  );

  output.classList.remove("hidden");
  loading.classList.remove("hidden");
  controls.classList.add("hidden");

  gallery.classList.add("hidden");
  hotelSection.classList.add("hidden");

  result.innerHTML = "";

  try {
    const res = await fetch(`${API_BASE}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_city: from, destination, start_date, end_date, days, interests }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    result.innerHTML = formatContent(data.itinerary_markdown);

    controls.classList.remove("hidden");
    updateBackground(destination);

    renderGallery(destination, 6);
    renderHotels(destination);

  } catch (err) {
    result.innerHTML = `<div style="color:#fca5a5;"><strong>Error:</strong> ${err.message}</div>`;
  } finally {
    loading.classList.add("hidden");
  }
});

// 📄 PDF Download
document.getElementById("download-pdf").addEventListener("click", () => {
  const element = document.getElementById("result");
  html2pdf().from(element).set({
    margin: 10,
    filename: 'travel_plan.pdf',
    image: { type: 'jpeg', quality: 1 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).save();
});
