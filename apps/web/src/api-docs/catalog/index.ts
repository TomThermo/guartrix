/** Assemble and re-export the API explorer catalog. */

import { ACCOUNT_PASSWORD_DEMOS, ACCOUNT_PROFILE_DEMOS } from "./account";
import { ADMIN_DEMOS } from "./admin";
import { APPLICATION_DEMOS } from "./application";
import { MISC_DEMOS } from "./misc";
import { SERVERS_DEMOS } from "./servers";
import type { ApiEndpointDemo } from "./types";

export type {
  HttpMethod,
  ApiAuthKind,
  ApiLang,
  ApiEndpointDemo,
} from "./types";
export { API_LANGS } from "./types";

export type { SnippetContext } from "./snippets";
export { generateSnippet } from "./snippets";

/** Preserve original demo order: Public → account → servers → app passwords → Application. */
export const API_ENDPOINT_DEMOS: ApiEndpointDemo[] = [
  ...MISC_DEMOS,
  ...ACCOUNT_PROFILE_DEMOS,
  ...SERVERS_DEMOS,
  ...ACCOUNT_PASSWORD_DEMOS,
  ...ADMIN_DEMOS,
  ...APPLICATION_DEMOS,
];

export function demoGroups(): string[] {
  return [...new Set(API_ENDPOINT_DEMOS.map((d) => d.group))];
}
