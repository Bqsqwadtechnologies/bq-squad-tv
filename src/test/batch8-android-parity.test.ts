import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Batch 8: Web and Android Parity", () => {
  const androidAppPath = path.resolve(process.cwd(), "android/app/src/main/java/com/bqsqwad/tv/ui/BqSqwadTvApp.kt");
  const browseScreensPath = path.resolve(process.cwd(), "android/app/src/main/java/com/bqsqwad/tv/ui/screens/BrowseScreens.kt");
  const walletScreenPath = path.resolve(process.cwd(), "android/app/src/main/java/com/bqsqwad/tv/ui/screens/WalletScreen.kt");
  const signInScreenPath = path.resolve(process.cwd(), "android/app/src/main/java/com/bqsqwad/tv/ui/screens/SignInScreen.kt");

  it("opens both Provider Console entry points on the live TV website", () => {
    const browseSource = fs.readFileSync(browseScreensPath, "utf-8");
    const providerUrls = [...browseSource.matchAll(/openUri\("(https:\/\/[^\"]+\/provider)"\)/g)]
      .map((match) => match[1]);
    expect(providerUrls).toEqual([
      "https://tv.bqsqwad.com/provider",
      "https://tv.bqsqwad.com/provider",
    ]);
  });

  it("ensures BqSqwadTvApp defines composables for all essential views including history, notifications, and wallet", () => {
    const appSource = fs.readFileSync(androidAppPath, "utf-8");
    expect(appSource).toContain('composable("history")');
    expect(appSource).toContain('composable("notifications")');
    expect(appSource).toContain('composable("wallet")');
    expect(appSource).toContain('composable("library")');
    expect(appSource).toContain('composable("live")');
    expect(appSource).toContain('composable("downloads")');
  });

  it("ensures Account and Settings screens provide account deletion and legal navigation", () => {
    const browseSource = fs.readFileSync(browseScreensPath, "utf-8");
    expect(browseSource).toContain("https://bqsqwad.com/account-deletion");
    expect(browseSource).toContain("https://bqsqwad.com/legal/terms");
    expect(browseSource).toContain("https://bqsqwad.com/legal/privacy-policy");
  });

  it("ensures WalletScreen provides back navigation and balance synchronization messaging", () => {
    const walletSource = fs.readFileSync(walletScreenPath, "utf-8");
    expect(walletSource).toContain("TextButton(onClick = onBack)");
    expect(walletSource).toContain("Top up with Google Play");
  });

  it("ensures SignInScreen provides Google sign-in fallback and legal consent checkboxes", () => {
    const signInSource = fs.readFileSync(signInScreenPath, "utf-8");
    expect(signInSource).toContain("Continue with Google");
    expect(signInSource).toContain("Google sign-in unavailable. Tap to retry.");
    expect(signInSource).toContain("Terms of service");
    expect(signInSource).toContain("Privacy notice");
  });
});
