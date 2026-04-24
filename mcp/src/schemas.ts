import { z } from "zod";

export const GetCompetitorSchema = z.object({
  slug: z.string().min(1)
});

export const GetCompetitorDataSchema = z.object({
  slug: z.string().min(1),
  page_type: z.string().optional()
});

export const GetIntelligenceBriefSchema = z.object({
  slug: z.string().min(1)
});

export const GetDeepDivesSchema = z.object({
  slug: z.string().min(1),
  limit: z.number().int().min(1).max(10).optional().default(3)
});

export const ListRecentIntelSchema = z.object({
  since: z.string().optional(),
  until: z.string().optional(),
  competitor: z.string().optional(),
  page_type: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional().default(50)
});

export const GetCompetitorDiffSchema = z.object({
  competitor: z.string().min(1),
  page_type: z.string().min(1),
  at: z.string().optional()
});

export const SearchIntelSchema = z.object({
  query: z.string().min(1),
  since: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(25)
});
