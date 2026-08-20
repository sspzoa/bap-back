import { KDMHS_WEBSITE } from "@/providers/kdmhs/config";
import { fetchWithRetry } from "@/utils/fetch";

export async function fetchWeekHtml(dateKey: string): Promise<string> {
  const url = `${KDMHS_WEBSITE.BASE_URL}/${KDMHS_WEBSITE.TABLE_PATH}?mi=13655`;

  return fetchWithRetry<string>(url, {
    method: "POST",
    body: new URLSearchParams({ schDt: dateKey }).toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    parser: async (response) => response.text(),
  });
}
