/** Interactive API explorer — shared types & language list. */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type ApiAuthKind = "none" | "gt" | "gta" | "session";
export type ApiLang = "curl" | "javascript" | "python" | "php" | "ruby" | "java" | "go";

export const API_LANGS: { id: ApiLang; label: string }[] = [
  { id: "curl", label: "cURL" },
  { id: "javascript", label: "Node.js" },
  { id: "python", label: "Python" },
  { id: "php", label: "PHP" },
  { id: "ruby", label: "Ruby" },
  { id: "java", label: "Java" },
  { id: "go", label: "Go" },
];

export type ApiEndpointDemo = {
  id: string;
  group: string;
  title: string;
  description: string;
  method: HttpMethod;
  /** Path with placeholders like {serverId} */
  path: string;
  auth: ApiAuthKind;
  /** Suggested JSON body (POST/PATCH/PUT) */
  body?: unknown;
  /** Query string examples without leading ? */
  query?: string;
  /** Safe to run against live panel without mutation */
  safe: boolean;
  sampleResponse?: unknown;
};
