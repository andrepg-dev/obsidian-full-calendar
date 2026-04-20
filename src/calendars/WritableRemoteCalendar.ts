import { OFCEvent } from "../types";
import RemoteCalendar from "./RemoteCalendar";

/**
 * Calendar whose source of truth is a remote HTTP API (e.g. Google Calendar),
 * but which supports creating, updating and deleting events over the wire.
 *
 * Unlike EditableCalendar (file-based), events here are addressed by a stable
 * remote id string rather than a Vault file + line number.
 */
export default abstract class WritableRemoteCalendar extends RemoteCalendar {
    constructor(color: string) {
        super(color);
    }

    /**
     * Create a remote event.
     * @returns the remote id that should be used to address this event.
     */
    abstract createRemoteEvent(event: OFCEvent): Promise<string>;

    /**
     * Update a remote event identified by its remote id.
     */
    abstract updateRemoteEvent(
        remoteId: string,
        event: OFCEvent
    ): Promise<void>;

    /**
     * Delete a remote event identified by its remote id.
     */
    abstract deleteRemoteEvent(remoteId: string): Promise<void>;
}
