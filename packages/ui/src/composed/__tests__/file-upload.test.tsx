import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileUpload, type StepResult, type UploadTicket } from "../file-upload";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// jsdom's own XMLHttpRequest would actually try to reach `uploadUrl`. A fake
// stands in so the test drives progress, success and failure deterministically
// instead of depending on network behaviour.
class FakeXHR {
  static instances: FakeXHR[] = [];

  method = "";
  url = "";
  status = 0;
  requestHeaders: Record<string, string> = {};
  aborted = false;
  upload: {
    onprogress:
      | ((event: { lengthComputable: boolean; loaded: number; total: number }) => void)
      | null;
  } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXHR.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.requestHeaders[name] = value;
  }
  send() {}
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
}

function latestXhr() {
  const xhr = FakeXHR.instances.at(-1);
  if (!xhr) throw new Error("no XMLHttpRequest was created");
  return xhr;
}

function okTicket(): StepResult<UploadTicket> {
  return {
    ok: true,
    data: {
      fileId: "file-1",
      uploadUrl: "https://storage.test/upload",
      uploadHeaders: { "content-type": "image/png" },
    },
  };
}

function pngFile(name = "photo.png") {
  return new File(["bytes"], name, { type: "image/png" });
}

function browseControl() {
  return screen.getByLabelText(/click to browse/i);
}

beforeEach(() => {
  FakeXHR.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
});

describe("FileUpload", () => {
  it("shows a dropzone with a browse control when idle", () => {
    render(<FileUpload onRequestUpload={vi.fn()} onConfirmUpload={vi.fn()} />);

    expect(browseControl()).toBeTruthy();
  });

  it("uploads a file, confirms it, and reports the result", async () => {
    const user = userEvent.setup();
    const onRequestUpload = vi.fn().mockResolvedValue(okTicket());
    const onConfirmUpload = vi.fn().mockResolvedValue({ ok: true, data: { id: "file-1" } });
    const onUploaded = vi.fn();

    render(
      <FileUpload
        onRequestUpload={onRequestUpload}
        onConfirmUpload={onConfirmUpload}
        onUploaded={onUploaded}
      />,
    );

    await user.upload(browseControl(), pngFile());

    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    const xhr = latestXhr();
    expect(xhr.method).toBe("PUT");
    expect(xhr.url).toBe("https://storage.test/upload");
    expect(xhr.requestHeaders["content-type"]).toBe("image/png");

    act(() => xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 }));
    expect(screen.getByText("50% uploaded")).toBeTruthy();

    act(() => {
      xhr.status = 204;
      xhr.onload?.();
    });

    await waitFor(() => expect(screen.getByText("Uploaded")).toBeTruthy());
    expect(onConfirmUpload).toHaveBeenCalledWith("file-1");
    expect(onUploaded).toHaveBeenCalledWith({ id: "file-1" });
  });

  it("shows the request-upload failure message and retries from the start", async () => {
    const user = userEvent.setup();
    const onRequestUpload = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: "File type not allowed." })
      .mockResolvedValueOnce(okTicket());
    const onConfirmUpload = vi.fn().mockResolvedValue({ ok: true, data: {} });

    render(<FileUpload onRequestUpload={onRequestUpload} onConfirmUpload={onConfirmUpload} />);

    await user.upload(browseControl(), pngFile());

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("File type not allowed."),
    );
    expect(onRequestUpload).toHaveBeenCalledTimes(1);
    expect(FakeXHR.instances).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(onRequestUpload).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
  });

  it("shows the confirm-upload failure message", async () => {
    const onRequestUpload = vi.fn().mockResolvedValue(okTicket());
    const onConfirmUpload = vi
      .fn()
      .mockResolvedValue({ ok: false, message: "Could not verify the file." });
    const user = userEvent.setup();

    render(<FileUpload onRequestUpload={onRequestUpload} onConfirmUpload={onConfirmUpload} />);

    await user.upload(browseControl(), pngFile());
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1));

    act(() => {
      const xhr = latestXhr();
      xhr.status = 204;
      xhr.onload?.();
    });

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Could not verify the file."),
    );
  });

  it("cancels an upload in progress and returns to the dropzone", async () => {
    const user = userEvent.setup();
    const onRequestUpload = vi.fn().mockResolvedValue(okTicket());
    const onConfirmUpload = vi.fn();

    render(<FileUpload onRequestUpload={onRequestUpload} onConfirmUpload={onConfirmUpload} />);

    await user.upload(browseControl(), pngFile());
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Cancel upload" }));

    expect(latestXhr().aborted).toBe(true);
    expect(browseControl()).toBeTruthy();
    expect(onConfirmUpload).not.toHaveBeenCalled();
  });

  it("rejects a file over the size limit before any network call", async () => {
    const user = userEvent.setup();
    const onRequestUpload = vi.fn();
    const onConfirmUpload = vi.fn();

    render(
      <FileUpload
        onRequestUpload={onRequestUpload}
        onConfirmUpload={onConfirmUpload}
        maxSizeBytes={2}
      />,
    );

    await user.upload(browseControl(), pngFile());

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(onRequestUpload).not.toHaveBeenCalled();
    expect(FakeXHR.instances).toHaveLength(0);
  });

  it("removes a finished upload and returns to the dropzone", async () => {
    const user = userEvent.setup();
    const onRequestUpload = vi.fn().mockResolvedValue(okTicket());
    const onConfirmUpload = vi.fn().mockResolvedValue({ ok: true, data: {} });

    render(<FileUpload onRequestUpload={onRequestUpload} onConfirmUpload={onConfirmUpload} />);

    await user.upload(browseControl(), pngFile());
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    act(() => {
      const xhr = latestXhr();
      xhr.status = 204;
      xhr.onload?.();
    });
    await waitFor(() => expect(screen.getByText("Uploaded")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: "Remove file" }));

    expect(browseControl()).toBeTruthy();
  });
});
