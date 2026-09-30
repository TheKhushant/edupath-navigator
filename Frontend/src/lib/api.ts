export const apiConfig = {
  baseUrl:
    import.meta.env["VITE_API_BASE_URL"] ??
    "http://localhost:5000/api",

  useMockData:
    (import.meta.env["VITE_USE_MOCK_DATA"] ?? "true") !== "false",
};
export async function apiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiConfig.baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

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