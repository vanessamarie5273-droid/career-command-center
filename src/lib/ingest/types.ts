export type Provider = "GREENHOUSE" | "LEVER" | "ASHBY" | "SMARTRECRUITERS" | "WORKDAY";

export type RawPosting = {
  provider: Provider;
  externalId: string;
  title: string;
  department?: string | null;
  location?: string | null;
  workplaceType?: string | null;
  isRemote?: boolean;
  descriptionHtml?: string | null;
  descriptionText?: string | null;
  applyUrl: string;
  postedAt?: Date | null;
  // Structured compensation published through the ATS (employer-provided)
  comp?: { salaryMin?: number; salaryMax?: number; oteMin?: number; oteMax?: number; summary?: string; equity?: boolean } | null;
};

export type BoardResult = { postings: RawPosting[]; total: number };

export class BoardNotFound extends Error {}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
