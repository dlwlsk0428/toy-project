"use client";

import { useEffect, useRef, useState } from "react";
import { DownloadIcon, Share2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  canvasToBlob,
  cardFile,
  drawShareCard,
  type ShareCardData,
} from "./share-card";

const MAX_NAME = 12;

/** Opens a preview of the result card, where it can be saved as an image or shared. */
export function ShareCardDialog({
  data,
  defaultName,
}: {
  data: Omit<ShareCardData, "name">;
  defaultName: () => string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canShareFiles =
    file !== null &&
    typeof navigator !== "undefined" &&
    navigator.canShare?.({ files: [file] }) === true;

  // Redraw whenever the card is open and the name changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const canvas = (canvasRef.current ??= document.createElement("canvas"));
    void (async () => {
      await drawShareCard(canvas, { ...data, name: name.trim() });
      const blob = await canvasToBlob(canvas);
      if (cancelled || !blob) return;
      setFile(cardFile(blob, data.at));
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
    })();
    return () => {
      cancelled = true;
    };
    // `data` is fixed for one result; only the name changes the card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, name]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const save = () => {
    if (!file || !preview) return;
    const link = document.createElement("a");
    link.href = preview;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    setStatus(`${file.name}로 저장했습니다.`);
  };

  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: "웹 펀치 리듬 기록" });
      setStatus("공유했습니다.");
    } catch (error) {
      // Closing the share sheet is not an error worth showing.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("공유하지 못했습니다. 이미지 저장을 이용해 주세요.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName(defaultName());
          setStatus(null);
        }
      }}
    >
      <DialogTrigger render={<Button size="lg" variant="outline" />}>
        <Share2Icon aria-hidden />
        공유 카드
      </DialogTrigger>
      <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>기록 공유 카드</DialogTitle>
          <DialogDescription>
            이미지로 저장하거나 바로 공유할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="mx-auto aspect-[4/5] w-full max-w-80 overflow-hidden rounded-xl bg-muted shadow-lg">
          {preview ? (
            // A blob URL drawn on a canvas; next/image adds nothing here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="정확도와 운동량이 담긴 기록 카드"
              className="size-full"
            />
          ) : (
            <p className="flex size-full items-center justify-center text-sm text-muted-foreground">
              카드를 만들고 있습니다…
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="share-name">카드에 넣을 이름</Label>
          <Input
            id="share-name"
            value={name}
            maxLength={MAX_NAME}
            placeholder="무명 복서"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        {status && (
          <p role="status" className="text-sm text-primary">
            {status}
          </p>
        )}
        <DialogFooter>
          {canShareFiles && (
            <Button variant="outline" onClick={share}>
              <Share2Icon aria-hidden />
              공유하기
            </Button>
          )}
          <Button onClick={save} disabled={!preview}>
            <DownloadIcon aria-hidden />
            이미지 저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
