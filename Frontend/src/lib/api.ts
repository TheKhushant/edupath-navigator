export const apiConfig = {
  baseUrl:
    import.meta.env["VITE_API_BASE_URL"] ??
    "https://edupath-navigator2.onrender.com/api",

  useMockData:
    (import.meta.env["VITE_USE_MOCK_DATA"] ?? "false") !== "false",
};

console.log("API BASE URL:", apiConfig.baseUrl);
console.log("USE MOCK DATA:", apiConfig.useMockData);

export async function apiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(
    `${apiConfig.baseUrl}${path}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers ?? {}),
      },
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("API ERROR:", data);

    throw new Error(
      data?.error ||
        data?.message ||
        `Request failed with status ${response.status}`,
    );
  }

  return data as T;
}

/** GET a binary file (e.g. an Excel template) from the API. */
export async function apiDownload(path: string): Promise<Blob> {
  const response = await fetch(`${apiConfig.baseUrl}${path}`);

  if (!response.ok) {
    const data = await response.json().catch(() => null);

    throw new Error(data?.message || `Download failed with status ${response.status}`);
  }

  return response.blob();
}
