import type { MediaLibraryAsset, MediaLibraryFolder, MediaLibraryState } from "@quanyu/shared";
import {
  copyMediaFolder,
  createMediaFolder,
  deleteMediaAsset,
  resolveAssetUrl,
  renameMediaFolder,
  updateMediaAsset,
  uploadFile,
} from "../lib/api";
import { useEffect, useState } from "react";

type MediaFilter = "image" | "video" | "all";

type UploadQueueItem = {
  id: string;
  fileName: string;
  progress: number;
  status: "queued" | "uploading" | "success" | "error";
  error?: string;
};

function normalizeFolderPath(value: string | undefined) {
  const normalized = (value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");

  return normalized === "." ? "" : normalized;
}

function getParentFolderPath(folderPath: string) {
  const normalized = normalizeFolderPath(folderPath);

  if (!normalized) {
    return "";
  }

  const parts = normalized.split("/");
  parts.pop();
  return parts.join("/");
}

function getFolderName(folderPath: string) {
  const normalized = normalizeFolderPath(folderPath);
  return normalized ? normalized.split("/").pop() ?? normalized : "根目录";
}

function getFolderLabel(folderPath: string) {
  return normalizeFolderPath(folderPath) || "根目录";
}

function filterAssetByType(asset: MediaLibraryAsset, mediaFilter: MediaFilter) {
  return mediaFilter === "all" || asset.mediaType === mediaFilter;
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${size} B`;
}

function buildFolderOptions(folders: MediaLibraryFolder[]) {
  return ["", ...folders.map((folder) => folder.path)];
}

function mediaAcceptValue(mediaFilter: MediaFilter) {
  switch (mediaFilter) {
    case "video":
      return "video/*";
    case "all":
      return "image/*,video/*";
    default:
      return "image/*";
  }
}

function getUploadStatusLabel(status: UploadQueueItem["status"]) {
  switch (status) {
    case "queued":
      return "等待中";
    case "uploading":
      return "上传中";
    case "success":
      return "成功";
    case "error":
      return "失败";
  }
}

function formatUploadErrorMessage(error: string | undefined) {
  const normalized = (error ?? "").replace(/^Error:\s*/, "").trim();

  if (!normalized) {
    return "上传失败";
  }

  if (normalized === "upload_network_error") {
    return "网络异常，上传请求没有成功发出";
  }

  if (normalized === "folder_not_found") {
    return "目标文件夹不存在";
  }

  if (normalized === "Only image and video uploads are supported") {
    return "当前只支持图片和视频素材";
  }

  if (normalized.startsWith("upload_failed_")) {
    return `上传失败，服务器返回 ${normalized.replace("upload_failed_", "")}`;
  }

  return normalized;
}

function AssetPreview(props: {
  src: string;
  alt: string;
  mediaType: "image" | "video";
  className?: string;
}) {
  const resolvedSrc = resolveAssetUrl(props.src);

  if (props.mediaType === "video") {
    return <video className={props.className} src={resolvedSrc} controls muted playsInline preload="metadata" />;
  }

  return <img className={props.className} src={resolvedSrc} alt={props.alt} />;
}

function UploadQueueDialog(props: { items: UploadQueueItem[]; open: boolean; onClose: () => void }) {
  if (!props.open || !props.items.length) {
    return null;
  }

  const successCount = props.items.filter((item) => item.status === "success").length;
  const errorCount = props.items.filter((item) => item.status === "error").length;
  const finishedCount = successCount + errorCount;
  const allFinished = finishedCount === props.items.length;

  return (
    <div className="admin-modal-backdrop" role="presentation">
      <div className="card admin-modal admin-upload-dialog" aria-modal="true" role="dialog" aria-labelledby="upload-dialog-title">
        <div className="admin-upload-dialog-handle" aria-hidden="true" />
        <div className="admin-upload-queue-head">
          <div>
            <h3 id="upload-dialog-title">上传进度</h3>
            <div className="entity-note">按选择顺序上传，实时显示进度、成功和失败。</div>
          </div>
          <div className="admin-upload-queue-summary">
            <strong>
              {finishedCount}/{props.items.length}
            </strong>
            <span className="entity-note">
              成功 {successCount} / 失败 {errorCount}
            </span>
          </div>
        </div>

        <div className="admin-upload-queue-list">
          {props.items.map((item, index) => (
            <div key={item.id} className="admin-upload-item">
              <div className="admin-upload-item-head">
                <strong>
                  {index + 1}. {item.fileName}
                </strong>
                <span className={`admin-upload-status is-${item.status}`}>{getUploadStatusLabel(item.status)}</span>
              </div>
              <div className="admin-upload-progress-track">
                <div className="admin-upload-progress-value" style={{ width: `${item.progress}%` }} />
              </div>
              <div className="entity-note">
                {item.status === "error" ? formatUploadErrorMessage(item.error) : item.status === "success" ? "上传完成" : `${item.progress}%`}
              </div>
            </div>
          ))}
        </div>

        <div className="admin-upload-dialog-actions">
          <div className="entity-note">
            {allFinished ? "上传已结束，可以关闭这个窗口。" : "上传仍在进行，请等待全部任务结束。"}
          </div>
          <button className="button primary" onClick={props.onClose} type="button" disabled={!allFinished}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

function MediaPicker(props: {
  library: MediaLibraryState;
  mediaFilter: MediaFilter;
  onSelect: (asset: MediaLibraryAsset) => void;
}) {
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("__all__");
  const folderOptions = buildFolderOptions(props.library.folders);
  const keyword = query.trim().toLowerCase();
  const assets = props.library.assets.filter((asset) => {
    if (!filterAssetByType(asset, props.mediaFilter)) {
      return false;
    }

    if (folderFilter !== "__all__" && asset.folderPath !== folderFilter) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    return asset.title.toLowerCase().includes(keyword) || asset.fileName.toLowerCase().includes(keyword);
  });

  return (
    <div className="admin-picker-panel">
      <div className="admin-picker-filters">
        <label className="admin-field">
          <span>搜索素材</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按标题或文件名搜索" />
        </label>
        <label className="admin-field">
          <span>文件夹</span>
          <select value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)}>
            <option value="__all__">全部文件夹</option>
            {folderOptions.map((folderPath) => (
              <option key={folderPath || "__root__"} value={folderPath}>
                {getFolderLabel(folderPath)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {assets.length ? (
        <div className="admin-asset-grid">
          {assets.map((asset) => (
            <article key={asset.id} className="card admin-asset-card compact">
              <AssetPreview src={asset.url} alt={asset.title} mediaType={asset.mediaType} className="admin-asset-preview" />
              <div className="admin-asset-body">
                <strong>{asset.title}</strong>
                <div className="entity-note">
                  {getFolderLabel(asset.folderPath)} | {formatFileSize(asset.size)}
                </div>
              </div>
              <button className="button secondary" onClick={() => props.onSelect(asset)} type="button">
                选用
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="entity-note">当前没有匹配的素材。</div>
      )}
    </div>
  );
}

export function MediaField(props: {
  label: string;
  value: string;
  previewType?: "image" | "video";
  mediaFilter?: MediaFilter;
  library: MediaLibraryState;
  adminToken: string;
  onLibraryChange: (library: MediaLibraryState) => void;
  onChange: (value: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const mediaFilter = props.mediaFilter ?? "image";
  const previewType = props.previewType ?? (mediaFilter === "video" ? "video" : "image");

  return (
    <div className="admin-media-field">
      <label className="admin-field">
        <span>{props.label}</span>
        <input value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      </label>
      <div className="admin-media-actions">
        <label className="button secondary admin-upload-btn">
          {uploading ? `上传中 ${uploadProgress}%` : "本地上传"}
          <input
            type="file"
            accept={mediaAcceptValue(mediaFilter)}
            style={{ display: "none" }}
            onChange={async (event) => {
              const file = event.target.files?.[0];

              if (!file) {
                return;
              }

              setUploading(true);
              setUploadProgress(0);
              try {
                const result = await uploadFile(file, props.adminToken, {
                  onProgress: setUploadProgress,
                });
                props.onLibraryChange(result.library);
                props.onChange(result.asset.url);
              } catch (error) {
                window.alert(`上传失败: ${formatUploadErrorMessage(error instanceof Error ? error.message : String(error))}`);
              } finally {
                setUploading(false);
                setUploadProgress(0);
                event.target.value = "";
              }
            }}
          />
        </label>
        <button className="button secondary" onClick={() => setPickerOpen((current) => !current)} type="button">
          {pickerOpen ? "收起素材库" : "从素材库选择"}
        </button>
        {props.value ? <AssetPreview src={props.value} alt={props.label} mediaType={previewType} className="admin-media-preview" /> : null}
      </div>
      {pickerOpen ? <MediaPicker library={props.library} mediaFilter={mediaFilter} onSelect={(asset) => props.onChange(asset.url)} /> : null}
    </div>
  );
}

function FolderTree(props: {
  folders: MediaLibraryFolder[];
  currentFolderPath: string;
  onChange: (folderPath: string) => void;
}) {
  return (
    <div className="card admin-folder-tree">
      <button
        className={`admin-folder-link ${props.currentFolderPath === "" ? "active" : ""}`}
        onClick={() => props.onChange("")}
        type="button"
      >
        根目录
      </button>
      {props.folders.map((folder) => {
        const depth = folder.path.split("/").length - 1;

        return (
          <button
            key={folder.id}
            className={`admin-folder-link ${props.currentFolderPath === folder.path ? "active" : ""}`}
            onClick={() => props.onChange(folder.path)}
            type="button"
            style={{ paddingLeft: `${14 + depth * 14}px` }}
          >
            {folder.name}
          </button>
        );
      })}
    </div>
  );
}

export function MediaLibraryManager(props: {
  library: MediaLibraryState;
  adminToken: string;
  onLibraryChange: (library: MediaLibraryState) => void;
}) {
  const [currentFolderPath, setCurrentFolderPath] = useState("");
  const [query, setQuery] = useState("");
  const [queueItems, setQueueItems] = useState<UploadQueueItem[]>([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  useEffect(() => {
    if (currentFolderPath && !props.library.folders.some((folder) => folder.path === currentFolderPath)) {
      setCurrentFolderPath("");
    }
  }, [currentFolderPath, props.library.folders]);

  useEffect(() => {
    if (!uploadDialogOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [uploadDialogOpen]);

  const childFolders = props.library.folders.filter((folder) => getParentFolderPath(folder.path) === currentFolderPath);
  const keyword = query.trim().toLowerCase();
  const visibleAssets = props.library.assets.filter((asset) => {
    if (asset.folderPath !== currentFolderPath) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    return asset.title.toLowerCase().includes(keyword) || asset.fileName.toLowerCase().includes(keyword);
  });
  const folderOptions = buildFolderOptions(props.library.folders);

  async function handleCreateFolder() {
    const name = window.prompt("请输入新文件夹名称");

    if (!name) {
      return;
    }

    try {
      const result = await createMediaFolder({ name, parentPath: currentFolderPath }, props.adminToken);
      props.onLibraryChange(result.library);
    } catch (error) {
      window.alert(`新建文件夹失败: ${String(error)}`);
    }
  }

  async function handleRenameCurrentFolder() {
    if (!currentFolderPath) {
      return;
    }

    const nextName = window.prompt("请输入新的文件夹名称", getFolderName(currentFolderPath));

    if (!nextName) {
      return;
    }

    try {
      const result = await renameMediaFolder({ path: currentFolderPath, newName: nextName }, props.adminToken);
      const nextPath = normalizeFolderPath(getParentFolderPath(currentFolderPath) ? `${getParentFolderPath(currentFolderPath)}/${nextName}` : nextName);
      props.onLibraryChange(result.library);
      setCurrentFolderPath(nextPath);
    } catch (error) {
      window.alert(`重命名文件夹失败: ${String(error)}`);
    }
  }

  async function handleCopyCurrentFolder() {
    if (!currentFolderPath) {
      return;
    }

    const newName = window.prompt("请输入复制后的文件夹名称", `${getFolderName(currentFolderPath)}-copy`);

    if (!newName) {
      return;
    }

    try {
      const result = await copyMediaFolder(
        {
          sourcePath: currentFolderPath,
          targetParentPath: getParentFolderPath(currentFolderPath),
          newName,
        },
        props.adminToken,
      );
      props.onLibraryChange(result.library);
    } catch (error) {
      window.alert(`复制文件夹失败: ${String(error)}`);
    }
  }

  async function handleRenameAsset(asset: MediaLibraryAsset) {
    const nextTitle = window.prompt("请输入新的素材名称", asset.title);

    if (!nextTitle || nextTitle === asset.title) {
      return;
    }

    try {
      const result = await updateMediaAsset(asset.id, { title: nextTitle }, props.adminToken);
      props.onLibraryChange(result.library);
    } catch (error) {
      window.alert(`重命名素材失败: ${String(error)}`);
    }
  }

  async function handleDeleteAsset(asset: MediaLibraryAsset) {
    if (!window.confirm(`确认删除素材“${asset.title}”？`)) {
      return;
    }

    try {
      const result = await deleteMediaAsset(asset.id, props.adminToken);
      props.onLibraryChange(result.library);
    } catch (error) {
      window.alert(`删除素材失败: ${String(error)}`);
    }
  }

  async function handleMoveAsset(asset: MediaLibraryAsset, folderPath: string) {
    try {
      const result = await updateMediaAsset(asset.id, { folderPath }, props.adminToken);
      props.onLibraryChange(result.library);
    } catch (error) {
      window.alert(`移动素材失败: ${String(error)}`);
    }
  }

  async function handleBatchUpload(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    const items = Array.from(files).map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      fileName: file.name,
      progress: 0,
      status: "queued" as const,
    }));

    setQueueItems(items);
    setUploadDialogOpen(true);

    for (const [index, file] of Array.from(files).entries()) {
      const queueId = items[index].id;

      setQueueItems((current) => current.map((item) => (item.id === queueId ? { ...item, status: "uploading", progress: 0 } : item)));

      try {
        const result = await uploadFile(file, props.adminToken, {
          folderPath: currentFolderPath,
          onProgress: (progress) => {
            setQueueItems((current) => current.map((item) => (item.id === queueId ? { ...item, status: "uploading", progress } : item)));
          },
        });

        props.onLibraryChange(result.library);
        setQueueItems((current) => current.map((item) => (item.id === queueId ? { ...item, status: "success", progress: 100 } : item)));
      } catch (error) {
        setQueueItems((current) =>
          current.map((item) =>
            item.id === queueId
              ? {
                  ...item,
                  status: "error",
                  error: error instanceof Error ? error.message : String(error),
                }
              : item,
          ),
        );
      }
    }
  }

  return (
    <div className="card admin-panel admin-media-panel">
      <div className="admin-toolbar admin-media-toolbar">
        <div>
          <h2>素材库</h2>
          <p className="entity-note">支持文件夹管理、批量上传、重命名、删除和素材移动。文件夹调整不会破坏已引用的素材地址。</p>
        </div>
        <div className="admin-media-toolbar-actions">
          <label className="button primary admin-upload-btn">
            批量上传
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              style={{ display: "none" }}
              onChange={async (event) => {
                await handleBatchUpload(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          {queueItems.length ? (
            <button className="button secondary" onClick={() => setUploadDialogOpen(true)} type="button">
              查看上传进度
            </button>
          ) : null}
          <button className="button secondary" onClick={handleCreateFolder} type="button">
            新建文件夹
          </button>
          {currentFolderPath ? (
            <>
              <button className="button secondary" onClick={handleRenameCurrentFolder} type="button">
                重命名文件夹
              </button>
              <button className="button secondary" onClick={handleCopyCurrentFolder} type="button">
                复制文件夹
              </button>
            </>
          ) : null}
        </div>
      </div>

      <UploadQueueDialog items={queueItems} open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)} />

      <div className="admin-media-workspace">
        <FolderTree folders={props.library.folders} currentFolderPath={currentFolderPath} onChange={setCurrentFolderPath} />

        <div className="admin-media-main">
          <div className="card admin-media-breadcrumbs">
            <strong>{getFolderLabel(currentFolderPath)}</strong>
            <div className="entity-note">
              子文件夹 {childFolders.length} 个 | 素材 {visibleAssets.length} 个
            </div>
          </div>

          <div className="admin-media-search">
            <label className="admin-field">
              <span>搜索当前文件夹</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按标题或文件名搜索" />
            </label>
          </div>

          {childFolders.length ? (
            <div className="admin-folder-card-grid">
              {childFolders.map((folder) => (
                <button key={folder.id} className="card admin-folder-card" onClick={() => setCurrentFolderPath(folder.path)} type="button">
                  <strong>{folder.name}</strong>
                  <div className="entity-note">{folder.path}</div>
                </button>
              ))}
            </div>
          ) : null}

          {visibleAssets.length ? (
            <div className="admin-asset-grid">
              {visibleAssets.map((asset) => (
                <article key={asset.id} className="card admin-asset-card">
                  <AssetPreview src={asset.url} alt={asset.title} mediaType={asset.mediaType} className="admin-asset-preview" />
                  <div className="admin-asset-body">
                    <strong>{asset.title}</strong>
                    <div className="entity-note">
                      {asset.mediaType === "video" ? "视频" : "图片"} | {formatFileSize(asset.size)}
                    </div>
                    <div className="entity-note">{asset.fileName}</div>
                    <div className="entity-note">{new Date(asset.updatedAt).toLocaleString()}</div>
                  </div>
                  <label className="admin-field compact">
                    <span>移动到文件夹</span>
                    <select value={asset.folderPath} onChange={(event) => void handleMoveAsset(asset, event.target.value)}>
                      {folderOptions.map((folderPath) => (
                        <option key={folderPath || "__root__"} value={folderPath}>
                          {getFolderLabel(folderPath)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="admin-asset-actions">
                    <button className="button secondary" onClick={() => void handleRenameAsset(asset)} type="button">
                      重命名
                    </button>
                    <button className="button secondary" onClick={() => void handleDeleteAsset(asset)} type="button">
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="card admin-empty-state">
              <strong>当前文件夹还没有素材</strong>
              <p>可以批量上传图片/视频，或者先新建子文件夹再继续整理。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
