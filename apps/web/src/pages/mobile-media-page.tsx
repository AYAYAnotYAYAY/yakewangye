import type { MediaLibraryAsset } from "@quanyu/shared";
import { useEffect, useState } from "react";
import { ADMIN_TOKEN_STORAGE_KEY, deleteMediaAsset, fetchMediaLibrary, resolveAssetUrl, uploadFile } from "../lib/api";

type UploadQueueItem = {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedBytes: number;
  progress: number;
  status: "queued" | "uploading" | "success" | "error";
  error?: string;
  thumbnailUrl?: string;
  file?: File;
};

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

export function MobileMediaPage() {
  const [token, setToken] = useState("");
  const [assets, setAssets] = useState<MediaLibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [queueItems, setQueueItems] = useState<UploadQueueItem[]>([]);
  const [showUploadList, setShowUploadList] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<MediaLibraryAsset | null>(null);

  useEffect(() => {
    const savedToken = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || "";
    if (!savedToken) {
      setError("请先在后台管理系统 (/admin) 登录。");
      setLoading(false);
      return;
    }
    setToken(savedToken);
    loadLibrary(savedToken);
  }, []);

  async function loadLibrary(authToken: string) {
    try {
      setLoading(true);
      const result = await fetchMediaLibrary(authToken);
      // 按照更新时间倒序排序
      const sortedAssets = [...result.library.assets].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      setAssets(sortedAssets);
      setError("");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !token) return;

    const fileArray = Array.from(files);
    const newItems = fileArray.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      fileName: file.name,
      fileSize: file.size,
      uploadedBytes: 0,
      progress: 0,
      status: "queued" as const,
      thumbnailUrl: URL.createObjectURL(file),
      file: file,
    }));

    // 将新选的文件加入队列，显示抽屉
    setQueueItems(current => [...current, ...newItems]);
    setShowUploadList(true);

    let hasSuccess = false;

    for (const item of newItems) {
      const queueId = item.id;
      const file = item.file!;

      setQueueItems((current) => current.map((i) => (i.id === queueId ? { ...i, status: "uploading", progress: 0 } : i)));

      try {
        await uploadFile(file, token, {
          onProgress: (progress) => {
            setQueueItems((current) => current.map((i) => (i.id === queueId ? { ...i, progress } : i)));
          },
          onTransferredBytes: (uploadedBytes) => {
            setQueueItems((current) => current.map((i) => (i.id === queueId ? { ...i, uploadedBytes } : i)));
          },
        });
        
        hasSuccess = true;
        setQueueItems((current) => current.map((i) => (i.id === queueId ? { ...i, status: "success", progress: 100 } : i)));
      } catch (uploadError) {
        setQueueItems((current) => current.map((i) => (i.id === queueId ? { 
          ...i, 
          status: "error", 
          error: uploadError instanceof Error ? uploadError.message : String(uploadError) 
        } : i)));
      }
    }

    if (hasSuccess) {
      loadLibrary(token);
    }
  }

  async function handleDelete(asset: MediaLibraryAsset) {
    if (!window.confirm("确定要删除这个素材吗？")) return;
    try {
      setPreviewAsset(null);
      await deleteMediaAsset(asset.id, token);
      loadLibrary(token);
    } catch (err) {
      window.alert(`删除失败: ${String(err)}`);
    }
  }

  const isUploading = queueItems.some(item => item.status === "uploading" || item.status === "queued");

  if (loading && assets.length === 0) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
        加载中...
      </div>
    );
  }

  if (error && assets.length === 0) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <p style={{ color: "red", marginBottom: "20px" }}>{error}</p>
        <a href="/admin" className="button primary" style={{ textDecoration: "none" }}>去登录</a>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: "100px", minHeight: "100vh", backgroundColor: "#f8f9fa" }}>
      {/* 顶部导航 */}
      <div style={{
        position: "sticky", top: 0, backgroundColor: "#fff", padding: "15px 20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)", zIndex: 10, display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <h1 style={{ margin: 0, fontSize: "18px", fontWeight: "600" }}>我的相册</h1>
        <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
          {queueItems.length > 0 && (
            <button 
              onClick={() => setShowUploadList(true)}
              style={{ background: "none", border: "none", color: "#1677ff", fontSize: "14px", padding: 0 }}
            >
              {isUploading ? "正在上传" : "上传记录"}
            </button>
          )}
          <a href="/admin" style={{ fontSize: "14px", color: "#666", textDecoration: "none" }}>返回后台</a>
        </div>
      </div>

      {/* 相册网格 */}
      {assets.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "#999" }}>
          相册是空的，点击下方按钮上传素材。
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2px", padding: "2px"
        }}>
          {assets.map((asset) => (
            <div
              key={asset.id}
              onClick={() => setPreviewAsset(asset)}
              style={{
                aspectRatio: "1/1",
                backgroundColor: "#eaeaea",
                position: "relative",
                overflow: "hidden"
              }}
            >
              {asset.mediaType === "video" ? (
                <video
                  src={resolveAssetUrl(asset.url)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  preload="metadata"
                />
              ) : (
                <img
                  src={resolveAssetUrl(asset.url)}
                  alt={asset.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  loading="lazy"
                />
              )}
              {asset.mediaType === "video" && (
                <div style={{
                  position: "absolute", bottom: "5px", right: "5px",
                  backgroundColor: "rgba(0,0,0,0.6)", color: "#fff",
                  fontSize: "10px", padding: "2px 4px", borderRadius: "3px"
                }}>
                  视频
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 悬浮上传按钮 */}
      <div style={{
        position: "fixed", bottom: "30px", left: "0", right: "0",
        display: "flex", justifyContent: "center", zIndex: 10
      }}>
        <label style={{
          backgroundColor: "#000", color: "#fff", padding: "12px 30px",
          borderRadius: "30px", fontSize: "16px", fontWeight: "500",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)", display: "flex", alignItems: "center", gap: "8px",
          cursor: "pointer"
        }}>
          <span style={{ fontSize: "20px", lineHeight: 1 }}>+</span>
          <span>上传素材</span>
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            style={{ display: "none" }}
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {/* 上传进度抽屉面板 */}
      {showUploadList && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", flexDirection: "column",
          justifyContent: "flex-end"
        }}>
          {/* 点击背景可收起 */}
          <div style={{ flex: 1 }} onClick={() => setShowUploadList(false)} />
          
          <div style={{
            backgroundColor: "#fff", borderTopLeftRadius: "16px", borderTopRightRadius: "16px",
            maxHeight: "80vh", display: "flex", flexDirection: "column"
          }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "16px" }}>上传列表</h3>
              <button onClick={() => setShowUploadList(false)} style={{ background: "none", border: "none", color: "#666", padding: "5px", fontSize: "14px" }}>收起</button>
            </div>
            
            <div style={{ padding: "0 20px", overflowY: "auto", flex: 1 }}>
              {queueItems.length === 0 ? (
                <div style={{ padding: "30px 0", textAlign: "center", color: "#999", fontSize: "14px" }}>暂无记录</div>
              ) : (
                queueItems.map(item => (
                  <div key={item.id} style={{ display: "flex", padding: "12px 0", borderBottom: "1px solid #f5f5f5" }}>
                    <img src={item.thumbnailUrl} alt={item.fileName} style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "6px", backgroundColor: "#eee" }} />
                    <div style={{ marginLeft: "12px", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div style={{ fontSize: "14px", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#333" }}>{item.fileName}</div>
                      <div style={{ fontSize: "12px", color: "#999", marginTop: "4px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                        <span>{formatFileSize(item.uploadedBytes)} / {formatFileSize(item.fileSize)}</span>
                        {item.status === "uploading" && <span style={{ color: "#1677ff", fontWeight: "500" }}>{item.progress}%</span>}
                        {item.status === "success" && <span style={{ color: "#52c41a", fontWeight: "500" }}>完成</span>}
                        {item.status === "error" && <span style={{ color: "#ff4d4f", fontWeight: "500", wordBreak: "break-all" }}>失败: {item.error}</span>}
                      </div>
                      {(item.status === "uploading" || item.status === "queued" || item.status === "error") && (
                        <div style={{ height: "4px", backgroundColor: "#eee", borderRadius: "2px", marginTop: "6px", overflow: "hidden" }}>
                          <div style={{ height: "100%", backgroundColor: item.status === "error" ? "#ff4d4f" : "#1677ff", width: `${item.progress}%`, transition: "width 0.2s" }} />
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div style={{ padding: "12px 20px", paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
              <button 
                onClick={() => { setQueueItems([]); setShowUploadList(false); }} 
                style={{ width: "100%", padding: "12px", backgroundColor: "#f5f5f5", border: "none", borderRadius: "8px", fontSize: "15px", color: "#666" }}
              >
                清空记录
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 图片/视频大图预览模态框 */}
      {previewAsset && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "#000", zIndex: 100, display: "flex", flexDirection: "column"
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", padding: "15px 20px",
            background: "linear-gradient(rgba(0,0,0,0.5), transparent)"
          }}>
            <button
              onClick={() => setPreviewAsset(null)}
              style={{ background: "none", border: "none", color: "#fff", fontSize: "16px", padding: "5px" }}
            >
              关闭
            </button>
            <button
              onClick={() => handleDelete(previewAsset)}
              style={{ background: "none", border: "none", color: "#ff4d4f", fontSize: "16px", padding: "5px" }}
            >
              删除
            </button>
          </div>

          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {previewAsset.mediaType === "video" ? (
              <video
                src={resolveAssetUrl(previewAsset.url)}
                controls
                autoPlay
                playsInline
                style={{ maxWidth: "100%", maxHeight: "100%" }}
              />
            ) : (
              <img
                src={resolveAssetUrl(previewAsset.url)}
                alt={previewAsset.title}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
