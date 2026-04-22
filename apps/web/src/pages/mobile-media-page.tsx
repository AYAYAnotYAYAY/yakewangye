import type { MediaLibraryAsset } from "@quanyu/shared";
import { useEffect, useState } from "react";
import { ADMIN_TOKEN_STORAGE_KEY, deleteMediaAsset, fetchMediaLibrary, resolveAssetUrl, uploadFile } from "../lib/api";

export function MobileMediaPage() {
  const [token, setToken] = useState("");
  const [assets, setAssets] = useState<MediaLibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
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

    setUploading(true);
    setUploadProgress(0);

    const fileArray = Array.from(files);
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      try {
        await uploadFile(file, token, {
          onProgress: (p) => {
            // 计算整体进度的大致比例
            const baseProgress = (i / fileArray.length) * 100;
            const currentProgress = (p / 100) * (100 / fileArray.length);
            setUploadProgress(Math.round(baseProgress + currentProgress));
          },
        });
      } catch (err) {
        window.alert(`文件 ${file.name} 上传失败: ${String(err)}`);
      }
    }

    setUploading(false);
    setUploadProgress(0);
    loadLibrary(token);
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

  if (loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
        加载中...
      </div>
    );
  }

  if (error) {
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
        <a href="/admin" style={{ fontSize: "14px", color: "#666", textDecoration: "none" }}>返回后台</a>
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
          cursor: "pointer", opacity: uploading ? 0.7 : 1, pointerEvents: uploading ? "none" : "auto"
        }}>
          {uploading ? (
            <span>上传中 {uploadProgress}%</span>
          ) : (
            <>
              <span style={{ fontSize: "20px", lineHeight: 1 }}>+</span>
              <span>上传素材</span>
            </>
          )}
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            style={{ display: "none" }}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      </div>

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
