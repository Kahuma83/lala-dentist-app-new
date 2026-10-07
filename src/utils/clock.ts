/**
 * Application Clock Abstraction for deterministic runtime & test execution
 * Allows mocking/fixing current operational time for tests without altering real system time
 */
export class AppClock {
  private static mockTime: string | null = null;

  /**
   * Set a fixed time for testing or simulation (ISO string or Date object)
   * Example: AppClock.setFixedTime("2026-09-21T09:00:00Z");
   */
  public static setFixedTime(isoOrDate: string | Date): void {
    if (typeof isoOrDate === "string") {
      this.mockTime = isoOrDate;
    } else {
      this.mockTime = isoOrDate.toISOString();
    }
  }

  /**
   * Reset clock back to normal system execution Date
   */
  public static reset(): void {
    this.mockTime = null;
  }

  /**
   * Returns current time in ISO format (YYYY-MM-DDTHH:mm:ss.sssZ)
   */
  public static nowISO(): string {
    if (this.mockTime) {
      return this.mockTime;
    }
    return new Date().toISOString();
  }

  /**
   * Returns current Date object
   */
  public static now(): Date {
    if (this.mockTime) {
      return new Date(this.mockTime);
    }
    return new Date();
  }

  /**
   * Returns YYYY-MM-DD string for current operational date in Asia/Jakarta (WIB) timezone
   */
  public static todayDateString(): string {
    if (this.mockTime) {
      return this.mockTime.split("T")[0];
    }
    const d = new Date();
    // Use Intl to format properly in Asia/Jakarta timezone
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(d);
  }

  /**
   * Returns current time string in HH:mm in Asia/Jakarta (WIB) timezone
   */
  public static currentTimeString(): string {
    if (this.mockTime && this.mockTime.includes("T")) {
      return this.mockTime.split("T")[1].substring(0, 5);
    }
    const d = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    return formatter.format(d);
  }
}
