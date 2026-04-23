import type { ToolContext } from "../lib/types.js";

const WEATHER_CODE_MAP: Record<number, string> = {
  0: "晴朗",
  1: "大致晴朗",
  2: "局部多云",
  3: "阴天",
  45: "有雾",
  48: "有冻雾",
  51: "小毛毛雨",
  53: "毛毛雨",
  55: "较强毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  80: "阵雨",
  81: "较强阵雨",
  82: "强阵雨",
  95: "雷暴"
};

type GeocodingResponse = {
  results?: Array<{
    name: string;
    country?: string;
    admin1?: string;
    latitude: number;
    longitude: number;
  }>;
};

type ForecastResponse = {
  current?: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
};

export async function getWeather(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<Record<string, unknown>> {
  const city = String(input.city ?? input.location ?? "").trim();
  if (!city) {
    throw new Error("Weather tool requires a city.");
  }

  const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geoUrl.searchParams.set("name", city);
  geoUrl.searchParams.set("count", "1");
  geoUrl.searchParams.set("language", "zh");
  geoUrl.searchParams.set("format", "json");

  const geoResponse = await fetch(geoUrl, {
    signal: AbortSignal.timeout(context.timeoutMs)
  });
  if (!geoResponse.ok) {
    throw new Error(`Geocoding failed with ${geoResponse.status}.`);
  }

  const geoData = (await geoResponse.json()) as GeocodingResponse;
  const place = geoData.results?.[0];
  if (!place) {
    throw new Error(`Could not find city: ${city}`);
  }

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(place.latitude));
  forecastUrl.searchParams.set("longitude", String(place.longitude));
  forecastUrl.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,weather_code,wind_speed_10m"
  );
  forecastUrl.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,precipitation_probability_max"
  );
  forecastUrl.searchParams.set("forecast_days", "1");
  forecastUrl.searchParams.set("timezone", "auto");

  const forecastResponse = await fetch(forecastUrl, {
    signal: AbortSignal.timeout(context.timeoutMs)
  });
  if (!forecastResponse.ok) {
    throw new Error(`Weather forecast failed with ${forecastResponse.status}.`);
  }

  const forecast = (await forecastResponse.json()) as ForecastResponse;
  const current = forecast.current;
  const daily = forecast.daily;
  if (!current || !daily) {
    throw new Error("Weather API returned incomplete data.");
  }

  return {
    city: [place.country, place.admin1, place.name].filter(Boolean).join(" / "),
    condition: WEATHER_CODE_MAP[current.weather_code] ?? `天气代码 ${current.weather_code}`,
    temperatureC: current.temperature_2m,
    feelsLikeC: current.apparent_temperature,
    windSpeedKmH: current.wind_speed_10m,
    todayHighC: daily.temperature_2m_max[0],
    todayLowC: daily.temperature_2m_min[0],
    precipitationProbability: daily.precipitation_probability_max[0]
  };
}
