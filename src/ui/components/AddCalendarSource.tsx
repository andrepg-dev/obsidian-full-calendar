import * as React from "react";
import { useEffect, useState } from "react";
import { Notice, Platform } from "obsidian";
import { CalendarInfo } from "../../types";
import {
    GoogleOAuthClient,
    GoogleTokenSet,
    hasGoogleCredentials,
    runGoogleOAuthFlow,
} from "../../calendars/parsing/google/auth";
import {
    GoogleCalendarListEntry,
    listCalendars,
} from "../../calendars/parsing/google/api";

type ChangeListener = <T extends Partial<CalendarInfo>>(
    fromString: (val: string) => T
) => React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement>;
type SourceWith<T extends Partial<CalendarInfo>, K> = T extends K ? T : never;

interface DirectorySelectProps<T extends Partial<CalendarInfo>> {
    source: T;
    changeListener: ChangeListener;
    directories: string[];
}

function DirectorySelect<T extends Partial<CalendarInfo>>({
    source,
    changeListener,
    directories,
}: DirectorySelectProps<T>) {
    const dirOptions = [...directories];
    dirOptions.sort();

    let sourceWithDirectory = source as SourceWith<T, { directory: undefined }>;
    return (
        <div className="setting-item">
            <div className="setting-item-info">
                <div className="setting-item-name">Directory</div>
                <div className="setting-item-description">
                    Directory to store events
                </div>
            </div>
            <div className="setting-item-control">
                <select
                    required
                    value={sourceWithDirectory.directory || ""}
                    onChange={changeListener((x) => ({
                        ...sourceWithDirectory,
                        directory: x,
                    }))}
                >
                    <option value="" disabled hidden>
                        Choose a directory
                    </option>
                    {dirOptions.map((o, idx) => (
                        <option key={idx} value={o}>
                            {o}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}

interface BasicProps<T extends Partial<CalendarInfo>> {
    source: T;
    changeListener: ChangeListener;
}

function ColorPicker<T extends Partial<CalendarInfo>>({
    source,
    changeListener,
}: BasicProps<T>) {
    return (
        <div className="setting-item">
            <div className="setting-item-info">
                <div className="setting-item-name">Color</div>
                <div className="setting-item-description">
                    The color of events on the calendar
                </div>
            </div>
            <div className="setting-item-control">
                <input
                    required
                    type="color"
                    value={source.color}
                    style={{ maxWidth: "25%", minWidth: "3rem" }}
                    onChange={changeListener((x) => ({ ...source, color: x }))}
                />
            </div>
        </div>
    );
}

function UrlInput<T extends Partial<CalendarInfo>>({
    source,
    changeListener,
}: BasicProps<T>) {
    let sourceWithUrl = source as SourceWith<T, { url: undefined }>;
    return (
        <div className="setting-item">
            <div className="setting-item-info">
                <div className="setting-item-name">Url</div>
                <div className="setting-item-description">
                    Url of the server
                </div>
            </div>
            <div className="setting-item-control">
                <input
                    required
                    type="text"
                    value={sourceWithUrl.url || ""}
                    onChange={changeListener((x) => ({
                        ...sourceWithUrl,
                        url: x,
                    }))}
                />
            </div>
        </div>
    );
}

function UsernameInput<T extends Partial<CalendarInfo>>({
    source,
    changeListener,
}: BasicProps<T>) {
    let sourceWithUsername = source as SourceWith<T, { username: undefined }>;
    return (
        <div className="setting-item">
            <div className="setting-item-info">
                <div className="setting-item-name">Username</div>
                <div className="setting-item-description">
                    Username for the account
                </div>
            </div>
            <div className="setting-item-control">
                <input
                    required
                    type="text"
                    value={sourceWithUsername.username || ""}
                    onChange={changeListener((x) => ({
                        ...sourceWithUsername,
                        username: x,
                    }))}
                />
            </div>
        </div>
    );
}

function HeadingInput<T extends Partial<CalendarInfo>>({
    source,
    changeListener,
    headings,
}: BasicProps<T> & { headings: string[] }) {
    let sourceWithHeading = source as SourceWith<T, { heading: undefined }>;
    return (
        <div className="setting-item">
            <div className="setting-item-info">
                <div className="setting-item-name">Heading</div>
                <div className="setting-item-description">
                    Heading to store events under in the daily note.
                </div>
            </div>
            <div className="setting-item-control">
                {headings.length > 0 ? (
                    <select
                        required
                        value={sourceWithHeading.heading || ""}
                        onChange={changeListener((x) => ({
                            ...sourceWithHeading,
                            heading: x,
                        }))}
                    >
                        <option value="" disabled hidden>
                            Choose a heading
                        </option>
                        {headings.map((o, idx) => (
                            <option key={idx} value={o}>
                                {o}
                            </option>
                        ))}
                    </select>
                ) : (
                    <input
                        required
                        type="text"
                        value={sourceWithHeading.heading || ""}
                        onChange={changeListener((x) => ({
                            ...sourceWithHeading,
                            heading: x,
                        }))}
                    />
                )}
            </div>
        </div>
    );
}

function PasswordInput<T extends Partial<CalendarInfo>>({
    source,
    changeListener,
}: BasicProps<T>) {
    let sourceWithPassword = source as SourceWith<T, { password: undefined }>;
    return (
        <div className="setting-item">
            <div className="setting-item-info">
                <div className="setting-item-name">Password</div>
                <div className="setting-item-description">
                    Password for the account
                </div>
            </div>
            <div className="setting-item-control">
                <input
                    required
                    type="password"
                    value={sourceWithPassword.password || ""}
                    onChange={changeListener((x) => ({
                        ...sourceWithPassword,
                        password: x,
                    }))}
                />
            </div>
        </div>
    );
}

interface GoogleConnectProps {
    color: string;
    oauthClient: GoogleOAuthClient;
    submit: (source: CalendarInfo) => Promise<void>;
}

const GoogleConnect = ({ color, oauthClient, submit }: GoogleConnectProps) => {
    const credentialsConfigured = hasGoogleCredentials(oauthClient);
    const onMobile = Platform.isMobile;

    const [tokens, setTokens] = useState<GoogleTokenSet | null>(null);
    const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([]);
    const [selectedCalendarId, setSelectedCalendarId] = useState<string>("");
    const [pickedColor, setPickedColor] = useState(color);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!tokens) return;
        let cancelled = false;
        (async () => {
            setBusy(true);
            try {
                const list = await listCalendars(tokens.accessToken);
                if (cancelled) return;
                setCalendars(list);
                const primary = list.find((c) => c.primary) || list[0];
                if (primary) setSelectedCalendarId(primary.id);
            } catch (err) {
                if (cancelled) return;
                const msg =
                    err instanceof Error ? err.message : String(err);
                setError(msg);
            } finally {
                if (!cancelled) setBusy(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [tokens]);

    if (onMobile) {
        return (
            <div className="setting-item">
                <div className="setting-item-info">
                    <div className="setting-item-name">
                        Google Calendar (desktop only)
                    </div>
                    <div className="setting-item-description">
                        The OAuth sign-in flow requires a local network
                        listener that is not available on Obsidian mobile.
                        Connect from a desktop vault and the calendar will
                        sync once Obsidian Sync brings it to your phone.
                    </div>
                </div>
            </div>
        );
    }

    if (!credentialsConfigured) {
        return (
            <div className="setting-item">
                <div className="setting-item-info">
                    <div className="setting-item-name">
                        Google credentials required
                    </div>
                    <div className="setting-item-description">
                        Scroll up to the <b>Google Calendar</b> section of
                        this settings tab and paste your OAuth Client ID and
                        Client Secret. The step-by-step setup is in the
                        collapsible there.
                    </div>
                </div>
            </div>
        );
    }

    const handleConnect = async () => {
        setError(null);
        setBusy(true);
        try {
            const result = await runGoogleOAuthFlow(oauthClient);
            setTokens(result);
            new Notice(`Connected to Google as ${result.email}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
            new Notice(msg);
        } finally {
            setBusy(false);
        }
    };

    const handleAdd = async () => {
        if (!tokens || !selectedCalendarId) return;
        const chosen = calendars.find((c) => c.id === selectedCalendarId);
        if (!chosen) return;
        setBusy(true);
        try {
            await submit({
                type: "google",
                color: pickedColor,
                accountEmail: tokens.email,
                calendarId: chosen.id,
                calendarSummary: chosen.summary,
                refreshToken: tokens.refreshToken,
                accessToken: tokens.accessToken,
                accessTokenExpiresAt: tokens.expiresAt,
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            {!tokens ? (
                <div className="setting-item">
                    <div className="setting-item-info">
                        <div className="setting-item-name">
                            Sign in with Google
                        </div>
                        <div className="setting-item-description">
                            Opens your browser for the OAuth consent screen.
                            The plugin requests access to read and write
                            calendar events.
                        </div>
                    </div>
                    <div className="setting-item-control">
                        <button
                            type="button"
                            className="mod-cta"
                            disabled={busy}
                            onClick={handleConnect}
                        >
                            {busy ? "Waiting for browser…" : "Connect"}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="setting-item">
                        <div className="setting-item-info">
                            <div className="setting-item-name">Account</div>
                            <div className="setting-item-description">
                                {tokens.email}
                            </div>
                        </div>
                    </div>
                    <div className="setting-item">
                        <div className="setting-item-info">
                            <div className="setting-item-name">Calendar</div>
                            <div className="setting-item-description">
                                Pick which calendar to sync into Full
                                Calendar.
                            </div>
                        </div>
                        <div className="setting-item-control">
                            <select
                                required
                                value={selectedCalendarId}
                                disabled={busy || calendars.length === 0}
                                onChange={(e) =>
                                    setSelectedCalendarId(e.target.value)
                                }
                            >
                                {calendars.length === 0 && (
                                    <option value="" disabled>
                                        Loading calendars…
                                    </option>
                                )}
                                {calendars.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.summary}
                                        {c.primary ? " (primary)" : ""}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="setting-item">
                        <div className="setting-item-info">
                            <div className="setting-item-name">Color</div>
                            <div className="setting-item-description">
                                Color used in the Full Calendar view.
                            </div>
                        </div>
                        <div className="setting-item-control">
                            <input
                                type="color"
                                value={pickedColor}
                                style={{ maxWidth: "25%", minWidth: "3rem" }}
                                onChange={(e) =>
                                    setPickedColor(e.target.value)
                                }
                            />
                        </div>
                    </div>
                    <div className="setting-item">
                        <div className="setting-item-info" />
                        <div className="setting-control">
                            <button
                                type="button"
                                className="mod-cta"
                                disabled={busy || !selectedCalendarId}
                                onClick={handleAdd}
                            >
                                {busy ? "Adding…" : "Add Calendar"}
                            </button>
                        </div>
                    </div>
                </>
            )}
            {error && (
                <div
                    className="setting-item-description"
                    style={{ color: "var(--text-error)" }}
                >
                    {error}
                </div>
            )}
        </div>
    );
};

interface AddCalendarProps {
    source: Partial<CalendarInfo>;
    directories: string[];
    headings: string[];
    googleOAuthClient: GoogleOAuthClient;
    submit: (source: CalendarInfo) => Promise<void>;
}

export const AddCalendarSource = ({
    source,
    directories,
    headings,
    googleOAuthClient,
    submit,
}: AddCalendarProps) => {
    if (source.type === "google") {
        return (
            <div className="vertical-tab-content">
                <GoogleConnect
                    color={source.color || "#3b82f6"}
                    oauthClient={googleOAuthClient}
                    submit={submit}
                />
            </div>
        );
    }

    const isCalDAV = source.type === "caldav";

    const [setting, setSettingState] = useState(source);
    const [submitting, setSubmitingState] = useState(false);
    const [submitText, setSubmitText] = useState(
        isCalDAV ? "Import Calendars" : "Add Calendar"
    );

    function makeChangeListener<T extends Partial<CalendarInfo>>(
        fromString: (val: string) => T
    ): React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement> {
        return (e) => setSettingState(fromString(e.target.value));
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!submitting) {
            setSubmitingState(true);
            setSubmitText(isCalDAV ? "Importing Calendars" : "Adding Calendar");
            await submit(setting as CalendarInfo);
        }
    };

    return (
        <div className="vertical-tab-content">
            <form onSubmit={handleSubmit}>
                {!isCalDAV && (
                    // CalDAV can import multiple calendars. Instead of picking
                    // a single color to be used for all calendars, default to the
                    // colors reported from the server. Users can change that later
                    // if they wish.
                    <ColorPicker
                        source={setting}
                        changeListener={makeChangeListener}
                    />
                )}
                {source.type === "local" && (
                    <DirectorySelect
                        source={setting}
                        changeListener={makeChangeListener}
                        directories={directories}
                    />
                )}
                {source.type === "dailynote" && (
                    <HeadingInput
                        source={setting}
                        changeListener={makeChangeListener}
                        headings={headings}
                    />
                )}
                {source.type === "ical" || source.type === "caldav" ? (
                    <UrlInput
                        source={setting}
                        changeListener={makeChangeListener}
                    />
                ) : null}
                {isCalDAV && (
                    <UsernameInput
                        source={setting}
                        changeListener={makeChangeListener}
                    />
                )}
                {isCalDAV && (
                    <PasswordInput
                        source={setting}
                        changeListener={makeChangeListener}
                    />
                )}
                <div className="setting-item">
                    <div className="setting-item-info" />
                    <div className="setting-control">
                        <button
                            className="mod-cta"
                            type="submit"
                            disabled={submitting}
                        >
                            {submitText}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};
