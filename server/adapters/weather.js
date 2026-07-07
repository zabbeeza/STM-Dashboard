// Weather adapter — Open-Meteo (no API key required). Returns current temp,
// today's high, a conditions text, and an icon key the frontend maps to art.
// Swap this module to change providers; the interface is getWeather().

const LAT = process.env.WEATHER_LATITUDE || '45.4765';
const LON = process.env.WEATHER_LONGITUDE || '-73.6104';
const TZ = process.env.WEATHER_TIMEZONE || 'America/Toronto';

// WMO weather-code → { text, icon }. Icon keys are rendered by the frontend.
const WMO = {
  0: ['Clear', 'sun'],
  1: ['Mainly clear', 'sun'],
  2: ['Partly cloudy', 'partly'],
  3: ['Overcast', 'cloud'],
  45: ['Fog', 'fog'], 48: ['Rime fog', 'fog'],
  51: ['Light drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Heavy drizzle', 'rain'],
  56: ['Freezing drizzle', 'rain'], 57: ['Freezing drizzle', 'rain'],
  61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'rain'], 67: ['Freezing rain', 'rain'],
  71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'],
  80: ['Rain showers', 'rain'], 81: ['Rain showers', 'rain'], 82: ['Violent showers', 'rain'],
  85: ['Snow showers', 'snow'], 86: ['Snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm', 'storm'], 99: ['Thunderstorm', 'storm'],
};

export async function getWeather() {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', LAT);
  url.searchParams.set('longitude', LON);
  url.searchParams.set('current', 'temperature_2m,weather_code');
  url.searchParams.set('daily', 'temperature_2m_max,weather_code');
  url.searchParams.set('timezone', TZ);
  url.searchParams.set('forecast_days', '1');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather fetch failed: HTTP ${res.status}`);
  const j = await res.json();

  const code = j.current?.weather_code ?? j.daily?.weather_code?.[0] ?? 3;
  const [text, icon] = WMO[code] || ['—', 'cloud'];

  return {
    temp: Math.round(j.current?.temperature_2m ?? 0),
    high: Math.round(j.daily?.temperature_2m_max?.[0] ?? j.current?.temperature_2m ?? 0),
    conditions: text,
    icon,
    // Extra: append a short phrase like the mock's "RAIN INTO PM" when wet.
    phrase: ['rain', 'storm', 'snow'].includes(icon) ? `${text.toUpperCase()} INTO PM` : text.toUpperCase(),
  };
}

export default { getWeather };
