const $ = (id) => document.getElementById(id);

const weatherCodes = {
  0: ["Clear sky", "☀️"],
  1: ["Mainly clear", "🌤️"],
  2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"],
  48: ["Depositing rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"],
  53: ["Moderate drizzle", "🌦️"],
  55: ["Dense drizzle", "🌧️"],
  56: ["Light freezing drizzle", "🌧️"],
  57: ["Dense freezing drizzle", "🌧️"],
  61: ["Slight rain", "🌦️"],
  63: ["Moderate rain", "🌧️"],
  65: ["Heavy rain", "🌧️"],
  66: ["Light freezing rain", "🌧️"],
  67: ["Heavy freezing rain", "🌧️"],
  71: ["Slight snow", "🌨️"],
  73: ["Moderate snow", "🌨️"],
  75: ["Heavy snow", "❄️"],
  77: ["Snow grains", "❄️"],
  80: ["Slight rain showers", "🌦️"],
  81: ["Moderate rain showers", "🌧️"],
  82: ["Violent rain showers", "⛈️"],
  85: ["Slight snow showers", "🌨️"],
  86: ["Heavy snow showers", "❄️"],
  95: ["Thunderstorm", "⛈️"],
  96: ["Thunderstorm with hail", "⛈️"],
  99: ["Thunderstorm with heavy hail", "⛈️"]
};

function weatherInfo(code) {
  return weatherCodes[code] || ["Weather conditions", "🌤️"];
}

function round(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toFixed(digits);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function aqiCategory(aqi) {
  if (aqi <= 50) return ["Good", "Air quality is satisfactory.", "#10b981"];
  if (aqi <= 100) return ["Moderate", "Acceptable; sensitive people may be affected.", "#d97706"];
  if (aqi <= 150) return ["Unhealthy for sensitive groups", "Sensitive groups should reduce prolonged exertion.", "#ea580c"];
  if (aqi <= 200) return ["Unhealthy", "Everyone may begin to experience health effects.", "#dc2626"];
  if (aqi <= 300) return ["Very unhealthy", "Avoid prolonged outdoor exertion.", "#9333ea"];
  return ["Hazardous", "Avoid outdoor activity and follow guidance.", "#be123c"];
}

// Calculate approximate US EPA AQI from pollutant concentrations.
function calculateAQI(pm25, pm10, ozone) {
  const breakpoints = [
    { pollutant: "pm25", ranges: [[0,12,0,50],[12.1,35.4,51,100],[35.5,55.4,101,150],[55.5,150.4,151,200],[150.5,250.4,201,300],[250.5,500.4,301,500]] },
    { pollutant: "pm10", ranges: [[0,54,0,50],[55,154,51,100],[155,254,101,150],[255,354,151,200],[355,424,201,300],[425,604,301,500]] }
  ];
  const values = { pm25, pm10 };
  let indexes = [];
  breakpoints.forEach(({pollutant, ranges}) => {
    const concentration = values[pollutant];
    if (concentration == null || !Number.isFinite(concentration)) return;
    const c = pollutant === "pm25" ? Math.floor(concentration * 10) / 10 : Math.floor(concentration);
    for (const [cLow, cHigh, iLow, iHigh] of ranges) {
      if (c >= cLow && c <= cHigh) {
        indexes.push(Math.round(((iHigh - iLow) / (cHigh - cLow)) * (c - cLow) + iLow));
        break;
      }
    }
  });
  if (indexes.length) return Math.max(...indexes);
  return ozone == null ? null : Math.round(ozone);
}

async function fetchWithRetry(url, retries = 2, delay = 800) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (res.status === 429 && i < retries) {
        await new Promise((r) => setTimeout(r, delay * (i + 1)));
        continue;
      }
      return res;
    } catch (err) {
      if (i < retries) {
        await new Promise((r) => setTimeout(r, delay * (i + 1)));
        continue;
      }
      throw err;
    }
  }
}

async function geocodeCity(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const response = await fetchWithRetry(url);
  if (!response.ok) throw new Error("Could not search for that city.");
  const data = await response.json();
  if (!data.results || !data.results.length) throw new Error("City not found. Try another city name.");
  return data.results[0];
}

async function getWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,pressure_msl",
    hourly: "uv_index",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset",
    timezone: "auto",
    forecast_days: "5"
  });
  const response = await fetchWithRetry(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error("Weather data is temporarily unavailable.");
  return response.json();
}

async function getAirQuality(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: "pm10,pm2_5,ozone,us_aqi",
    timezone: "auto"
  });
  const response = await fetchWithRetry(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`);
  if (!response.ok) throw new Error("Air quality data is temporarily unavailable.");
  return response.json();
}

function renderWeather(data, place) {
  const current = data.current;
  const [description, icon] = weatherInfo(current.weather_code);
  const time = new Date(current.time);
  
  const locationParts = [place.name];
  if (place.admin1 && place.admin1 !== place.name) {
    locationParts.push(place.admin1);
  }
  if (place.country) {
    locationParts.push(place.country);
  }
  setText("cityName", locationParts.join(", "));
  setText("localDate", time.toLocaleString(undefined, { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
  setText("temperature", round(current.temperature_2m));
  setText("weatherDescription", description);
  setText("feelsLike", `${round(current.apparent_temperature)}°C`);
  setText("humidity", `${round(current.relative_humidity_2m)}%`);
  setText("windSpeed", `${round(current.wind_speed_10m)} km/h`);
  setText("pressure", `${round(current.pressure_msl)} hPa`);
  
  const iconEl = $("weatherIcon");
  if (iconEl) iconEl.textContent = icon;
  
  const currentHourPrefix = current.time ? current.time.slice(0, 13) : "";
  let uvIndexVal = "--";
  if (data.hourly && Array.isArray(data.hourly.time) && Array.isArray(data.hourly.uv_index)) {
    const hourlyIndex = data.hourly.time.findIndex(t => t.startsWith(currentHourPrefix));
    if (hourlyIndex >= 0 && data.hourly.uv_index[hourlyIndex] != null) {
      uvIndexVal = round(data.hourly.uv_index[hourlyIndex], 1);
    } else if (data.hourly.uv_index.length > 0 && data.hourly.uv_index[0] != null) {
      uvIndexVal = round(data.hourly.uv_index[0], 1);
    }
  }
  setText("uvIndex", uvIndexVal);
  renderForecast(data.daily);
}

function renderForecast(daily) {
  const container = $("forecast");
  if (!container) return;
  container.innerHTML = "";
  if (!daily || !Array.isArray(daily.time)) {
    container.innerHTML = '<div class="forecast-loading">Forecast unavailable</div>';
    return;
  }
  daily.time.forEach((date, index) => {
    const [description, icon] = weatherInfo(daily.weather_code[index]);
    const day = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
    const card = document.createElement("div");
    card.className = "forecast-day";
    card.innerHTML = `
      <span class="forecast-date">${index === 0 ? "Today" : day}</span>
      <span class="forecast-icon" aria-hidden="true">${icon}</span>
      <span class="forecast-desc">${description}</span>
      <span class="forecast-temps"><span>${round(daily.temperature_2m_max[index])}°</span><span>${round(daily.temperature_2m_min[index])}°</span></span>
    `;
    container.appendChild(card);
  });
}

function renderAir(data) {
  const current = data.current;
  const pm25 = current.pm2_5;
  const pm10 = current.pm10;
  const ozone = current.ozone;
  const aqi = current.us_aqi ?? calculateAQI(pm25, pm10, ozone);
  setText("pm25", `${round(pm25, 1)} µg/m³`);
  setText("pm10", `${round(pm10, 1)} µg/m³`);
  setText("ozone", `${round(ozone, 1)} µg/m³`);

  if (aqi == null) {
    setText("aqiValue", "--");
    setText("aqiCategory", "Unavailable");
    setText("aqiAdvice", "No AQI data available for this location.");
    setText("aqiPill", "Unavailable");
    return;
  }
  const [category, advice, color] = aqiCategory(aqi);
  setText("aqiValue", Math.round(aqi));
  setText("aqiCategory", category);
  setText("aqiAdvice", advice);
  setText("aqiPill", category);
  
  const aqiPill = $("aqiPill");
  if (aqiPill) {
    aqiPill.style.color = color;
    aqiPill.style.borderColor = `${color}44`;
    aqiPill.style.backgroundColor = `${color}18`;
  }
  
  const aqiValue = $("aqiValue");
  if (aqiValue) {
    aqiValue.style.color = color;
  }
  
  const aqiMeterFill = $("aqiMeterFill");
  if (aqiMeterFill) {
    aqiMeterFill.style.left = `${Math.min(98, Math.max(0, (aqi / 500) * 100))}%`;
  }
}

async function loadCity(city) {
  setText("statusMessage", "");
  setText("updatedAt", "Updating...");
  const forecastEl = $("forecast");
  if (forecastEl) forecastEl.innerHTML = '<div class="forecast-loading">Loading forecast...</div>';
  try {
    const place = await geocodeCity(city);
    const [weather, air] = await Promise.all([
      getWeather(place.latitude, place.longitude),
      getAirQuality(place.latitude, place.longitude)
    ]);
    renderWeather(weather, place);
    renderAir(air);
    setText("updatedAt", `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    const cityInput = $("cityInput");
    if (cityInput) cityInput.value = place.name;
  } catch (error) {
    setText("statusMessage", error.message || "Something went wrong. Please try again.");
    setText("updatedAt", "Update failed");
    if (forecastEl) forecastEl.innerHTML = '<div class="forecast-loading">Forecast unavailable.</div>';
  }
}

const themeToggle = $("themeToggle");

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("skysense_theme", theme);
  if (themeToggle) {
    const isDark = theme === "dark";
    const icon = themeToggle.querySelector(".theme-toggle-icon");
    const label = themeToggle.querySelector(".theme-toggle-text");
    if (icon) icon.textContent = isDark ? "☀️" : "🌙";
    if (label) label.textContent = isDark ? "White UI" : "Black UI";
  }
}

const urlParams = new URLSearchParams(window.location.search);
const themeParam = urlParams.get("theme");
const savedTheme = themeParam || localStorage.getItem("skysense_theme") || "light";
applyTheme(savedTheme);

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const nextTheme = current === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  });
}

const searchForm = $("searchForm");
if (searchForm) {
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const cityInput = $("cityInput");
    const city = cityInput ? cityInput.value.trim() : "";
    if (city) loadCity(city);
  });
}

const brandLink = document.querySelector(".brand");
if (brandLink) {
  brandLink.addEventListener("click", (event) => {
    event.preventDefault();
    loadCity("Dehradun");
  });
}

const initialCity = urlParams.get("city") || "Dehradun";
loadCity(initialCity);
setInterval(() => {
  const cityInput = $("cityInput");
  const city = cityInput ? cityInput.value.trim() : "";
  if (city) loadCity(city);
}, 10 * 60 * 1000);
