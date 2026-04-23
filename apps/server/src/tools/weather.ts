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
    country_code?: string;
    country?: string;
    admin1?: string;
    admin2?: string;
    feature_code?: string;
    population?: number;
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

type GeocodingPlace = NonNullable<GeocodingResponse["results"]>[number];

const DIRECT_CITY_ALIASES: Record<string, string[]> = {
  上海: ["上海"],
  北京: ["北京市"],
  天津: ["天津市"],
  重庆: ["重庆市"],
  香港: ["香港"],
  澳门: ["澳门"]
};

async function fetchJsonWithRetry<T>(url: URL, timeoutMs: number, label: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!response.ok) {
        throw new Error(`${label} failed with ${response.status}.`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;

      if (attempt === 2) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`${label} request failed: ${detail}`);
      }
    }
  }

  throw new Error(`${label} request failed: ${String(lastError)}`);
}

function isChineseText(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function normalizePlaceName(value: string | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/(特别行政区|自治州|地区|盟|市|区|县)$/u, "");
}

function buildGeoQueries(city: string): string[] {
  const cleaned = city.trim();
  const queries = new Set<string>();
  const directAliases = DIRECT_CITY_ALIASES[cleaned];

  if (directAliases && directAliases.length > 0) {
    for (const alias of directAliases) {
      queries.add(alias);
    }
  } else {
    queries.add(cleaned);
  }

  if (isChineseText(cleaned)) {
    const base = normalizePlaceName(cleaned);

    if (base && base !== cleaned) {
      queries.add(base);
    }

    if (
      base &&
      !/(市|区|县|盟|自治州|地区|特别行政区)$/u.test(cleaned) &&
      !directAliases
    ) {
      queries.add(`${base}市`);
    }
  }

  return [...queries];
}

function scorePlace(place: GeocodingPlace, requestedCity: string, query: string): number {
  const requestedBase = normalizePlaceName(requestedCity);
  const queryBase = normalizePlaceName(query);
  const placeName = String(place.name ?? "").trim();
  const placeBase = normalizePlaceName(placeName);

  let score = 0;

  if (place.country_code === "CN") {
    score += 100;
  }

  if (placeName === query) {
    score += 220;
  }

  if (placeName === requestedCity) {
    score += 180;
  }

  if (placeBase && placeBase === requestedBase) {
    score += 160;
  }

  if (placeBase && placeBase === queryBase) {
    score += 120;
  }

  if (place.feature_code === "PPLC") {
    score += 90;
  } else if (place.feature_code === "PPLA") {
    score += 70;
  } else if (place.feature_code === "PPLA2") {
    score += 50;
  }

  if (typeof place.population === "number") {
    score += Math.min(place.population / 100000, 60);
  }

  return score;
}

async function findBestPlace(city: string, timeoutMs: number) {
  const queries = buildGeoQueries(city);
  let bestPlace: GeocodingPlace | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const query of queries) {
    const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geoUrl.searchParams.set("name", query);
    geoUrl.searchParams.set("count", "10");
    geoUrl.searchParams.set("language", "zh");
    geoUrl.searchParams.set("format", "json");

    if (isChineseText(query)) {
      geoUrl.searchParams.set("countryCode", "CN");
    }

    const geoData = await fetchJsonWithRetry<GeocodingResponse>(geoUrl, timeoutMs, "Geocoding");
    for (const place of geoData.results ?? []) {
      const score = scorePlace(place, city, query);
      if (score > bestScore) {
        bestScore = score;
        bestPlace = place;
      }
    }
  }

  return bestPlace;
}

export async function getWeather(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<Record<string, unknown>> {
  const city = String(input.city ?? input.location ?? "").trim();
  if (!city) {
    throw new Error("Weather tool requires a city.");
  }

  const place = await findBestPlace(city, context.timeoutMs);
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

  const forecast = await fetchJsonWithRetry<ForecastResponse>(
    forecastUrl,
    context.timeoutMs,
    "Weather forecast"
  );
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
