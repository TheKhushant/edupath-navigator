export const apiConfig = {
  baseUrl: "https://edupath-navigator2.onrender.com/api",

  useMockData: false,
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