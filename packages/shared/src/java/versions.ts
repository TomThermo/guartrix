/** Supported Minecraft runtime Java versions → Docker images. */
export const JAVA_VERSIONS = [
  {
    version: "8",
    label: "Java 8",
    image: "eclipse-temurin:8-jre-jammy",
  },
  {
    version: "11",
    label: "Java 11",
    image: "eclipse-temurin:11-jre-jammy",
  },
  {
    version: "17",
    label: "Java 17",
    image: "eclipse-temurin:17-jre-jammy",
  },
  {
    version: "21",
    label: "Java 21",
    image: "eclipse-temurin:21-jre-jammy",
  },
  {
    version: "25",
    label: "Java 25",
    image: "eclipse-temurin:25-jre-jammy",
  },
] as const;

export type JavaVersion = (typeof JAVA_VERSIONS)[number]["version"];

export const DEFAULT_JAVA_VERSION: JavaVersion = "25";

const JAVA_VERSION_SET = new Set<string>(JAVA_VERSIONS.map((j) => j.version));

export function isJavaVersion(v: string): v is JavaVersion {
  return JAVA_VERSION_SET.has(v);
}

export function normalizeJavaVersion(value: string | null | undefined): JavaVersion {
  if (value && isJavaVersion(value)) return value;
  // Legacy: absolute path stored in javaPath — map by folder name if possible
  if (value?.includes("java-")) {
    const m = /java-(\d+)/.exec(value);
    if (m && isJavaVersion(m[1]!)) return m[1];
  }
  return DEFAULT_JAVA_VERSION;
}

export function dockerImageForJava(version: string | null | undefined): string {
  const v = normalizeJavaVersion(version);
  return JAVA_VERSIONS.find((j) => j.version === v)!.image;
}
