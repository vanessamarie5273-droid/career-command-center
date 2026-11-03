import { afterEach, describe, expect, it } from "vitest";
import { envBase } from "@/lib/appUrl";

describe("app address for email links", () => {
  const saved = { a: process.env.APP_URL, r: process.env.RENDER_EXTERNAL_URL };
  afterEach(() => { process.env.APP_URL = saved.a; process.env.RENDER_EXTERNAL_URL = saved.r; if (saved.a === undefined) delete process.env.APP_URL; if (saved.r === undefined) delete process.env.RENDER_EXTERNAL_URL; });

  it("ignores an APP_URL that is not a web address, such as a pasted secret", () => {
    process.env.APP_URL = "Q8~8Q~notAUrl.value";
    delete process.env.RENDER_EXTERNAL_URL;
    expect(envBase()).toBeNull();
    process.env.RENDER_EXTERNAL_URL = "https://ccc-hourly.onrender.com";
    expect(envBase()).toBe("https://ccc-hourly.onrender.com");
  });

  it("uses a real APP_URL and drops trailing slashes and paths", () => {
    process.env.APP_URL = " https://ccc-web-heif.onrender.com/ ";
    expect(envBase()).toBe("https://ccc-web-heif.onrender.com");
  });
});
