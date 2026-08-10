import {
  ACTIVITY_PAGE_DEFAULT,
  ACTIVITY_PAGE_MAX,
  type ActivityListResponse,
} from "@guartrix/shared";
import { activityRetentionDays, toActivityRecord } from "../activity-log.js";
import {
  countActivityEvents,
  findManyActivityEvents,
  type ActivityEventWhereInput,
} from "./activity-events.js";

export type { ActivityEventWhereInput };

export type ActivityPageQuery = {
  offset: number;
  limit: number;
};

export async function listActivityPage(
  where: ActivityEventWhereInput,
  query: ActivityPageQuery,
): Promise<ActivityListResponse> {
  const [rows, total] = await Promise.all([
    findManyActivityEvents({
      where,
      orderBy: { createdAt: "desc" },
      skip: query.offset,
      take: query.limit,
    }),
    countActivityEvents({ where }),
  ]);
  return {
    events: rows.map(toActivityRecord),
    total,
    offset: query.offset,
    limit: query.limit,
    retentionDays: activityRetentionDays(),
  };
}

export { ACTIVITY_PAGE_DEFAULT, ACTIVITY_PAGE_MAX };
