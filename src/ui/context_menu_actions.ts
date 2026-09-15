import EventCache from "../core/EventCache";

type DeleteCache = Pick<
    EventCache,
    | "getEventById"
    | "supportsInstanceEdit"
    | "deleteRecurringInstance"
    | "deleteEvent"
>;

/**
 * Delete what a rendered event chip represents.
 *
 * A recurring chip represents one occurrence even though FullCalendar gives
 * every occurrence the series master's id. Never fall through to deleting the
 * master: calendars without occurrence support must fail safely instead.
 */
export async function deleteContextMenuEvent(
    cache: DeleteCache,
    eventId: string,
    occurrenceDate: string | null
): Promise<"occurrence" | "event"> {
    const event = cache.getEventById(eventId);
    if (!event) {
        throw new Error("Event does not exist.");
    }

    if (event.type !== "single") {
        if (!occurrenceDate || !cache.supportsInstanceEdit(eventId)) {
            throw new Error(
                "This calendar cannot delete a single occurrence of a repeating event."
            );
        }
        await cache.deleteRecurringInstance(eventId, occurrenceDate);
        return "occurrence";
    }

    await cache.deleteEvent(eventId);
    return "event";
}
