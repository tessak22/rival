/**
 * Social media profile extraction schema.
 *
 * Endpoint: /extract/json, effort: low
 * Why low effort: public social profiles are server-rendered or have accessible
 * static data. Full browser rendering is rarely needed.
 *
 * Fallback: /automate — some platforms (LinkedIn, YouTube) may require more
 * sophisticated extraction. /automate is preferred when extract/json returns empty.
 *
 * Note: Use a separate page entry per social platform per competitor.
 * Do not combine multiple platforms into one extraction call.
 *
 * Field notes:
 * - followers: track delta over time for growth rate, not absolute value.
 *   Sudden follower spikes can signal a viral moment or paid campaign.
 * - recent_post_topics: surface strategic messaging shifts. New topic clusters
 *   appearing suddenly can reveal upcoming launches or pivots.
 * - posting_frequency: decline in frequency can signal team bandwidth issues.
 *   Increase can signal a ramp-up to a launch.
 * - platform: always extracted so a single schema works across Twitter, LinkedIn,
 *   and YouTube without separate schemas.
 */

export const SOCIAL_SCHEMA = {
  type: "object",
  properties: {
    followers: {
      type: "number",
      description:
        "Follower or subscriber count. Track delta between scans — velocity matters more than absolute count."
    },
    platform: {
      type: "string",
      description: "Platform name: twitter, linkedin, youtube, instagram, etc."
    },
    recent_post_topics: {
      type: "array",
      items: { type: "string" },
      description: "Topics or themes of recent posts. Changes reveal strategic messaging shifts."
    },
    posting_frequency: {
      type: "string",
      description: "Observed posting cadence: daily, weekly, a few times a week, monthly, irregular"
    }
  },
  required: ["followers", "platform", "recent_post_topics"]
} as const;

export const SOCIAL_EXPECTED_FIELDS: string[] = [...SOCIAL_SCHEMA.required];

export type SocialData = {
  followers?: number;
  platform?: string;
  recent_post_topics?: string[];
  posting_frequency?: string;
};
