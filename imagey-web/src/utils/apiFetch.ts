export const apiFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  try {
    const response = await fetch(input, init);
    if (!response.ok && response.status >= 500) {
      window.ui?.("#server-error-toast");
    }
    return response;
  } catch (error) {
    window.ui?.("#server-error-toast");
    throw error;
  }
};
