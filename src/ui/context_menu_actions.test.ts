import { OFCEvent } from "../types";
import { deleteContextMenuEvent } from "./context_menu_actions";

const recurringEvent = {
    type: "rrule",
    title: "Weekly event",
} as OFCEvent;

const singleEvent = {
    type: "single",
    title: "One-off event",
} as OFCEvent;

function makeCache(event: OFCEvent, supportsInstanceEdit: boolean) {
    return {
        getEventById: jest.fn(() => event),
        supportsInstanceEdit: jest.fn(() => supportsInstanceEdit),
        deleteRecurringInstance: jest.fn(async () => undefined),
        deleteEvent: jest.fn(async () => undefined),
    };
}

describe("deleteContextMenuEvent", () => {
    it("deletes only the clicked occurrence of a repeating event", async () => {
        const cache = makeCache(recurringEvent, true);

        await expect(
            deleteContextMenuEvent(cache, "series-id", "2026-08-20")
        ).resolves.toBe("occurrence");

        expect(cache.deleteRecurringInstance).toHaveBeenCalledWith(
            "series-id",
            "2026-08-20"
        );
        expect(cache.deleteEvent).not.toHaveBeenCalled();
    });

    it("never deletes a repeating series as a fallback", async () => {
        const cache = makeCache(recurringEvent, false);

        await expect(
            deleteContextMenuEvent(cache, "series-id", "2026-08-20")
        ).rejects.toThrow(/cannot delete a single occurrence/i);

        expect(cache.deleteRecurringInstance).not.toHaveBeenCalled();
        expect(cache.deleteEvent).not.toHaveBeenCalled();
    });

    it("deletes a non-repeating event normally", async () => {
        const cache = makeCache(singleEvent, false);

        await expect(
            deleteContextMenuEvent(cache, "event-id", "2026-08-20")
        ).resolves.toBe("event");

        expect(cache.deleteRecurringInstance).not.toHaveBeenCalled();
        expect(cache.deleteEvent).toHaveBeenCalledWith("event-id");
    });
});
