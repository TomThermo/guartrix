/**
 * k6 load-test template for operator staging (wave 3 / X1).
 *
 * NOT run in repo CI — point at your staging panel only.
 *
 * Usage:
 *   k6 run scripts/load-test-k6-template.js
 *   K6_BASE_URL=https://staging.example.com k6 run scripts/load-test-k6-template.js
 *
 * Requires: https://k6.io/docs/get-started/installation/
 */
import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = (__ENV.K6_BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");

export const options = {
  vus: Number(__ENV.K6_VUS || 5),
  duration: __ENV.K6_DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<2000"],
  },
};

export default function loadSmoke() {
  const health = http.get(`${baseUrl}/api/health`);
  check(health, {
    "health 200": (r) => r.status === 200,
  });

  const loginPage = http.get(`${baseUrl}/login`);
  check(loginPage, {
    "login page 200": (r) => r.status === 200,
  });

  sleep(1);
}
