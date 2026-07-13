import torch
import torch.nn as nn


def build_stage2_model(num_classes: int = 3, gru_hidden: int = 256, gru_layers: int = 2, dropout: float = 0.5) -> nn.Module:
    """
    Anomaly Classifier — 3-class (Fight / Robbery / Accident).

    Architecture matches model3class_classification.ipynb (EfficientGRU) exactly:
        EfficientNet-B0  (1280-dim output after global avg-pool)
        → Linear(1280→512) → LayerNorm(512) → ReLU → Dropout(dropout*0.5)
        → Bidirectional GRU(512, hidden=gru_hidden, layers=gru_layers)
        → Attention pooling
        → Dropout(dropout) → Linear(gru_hidden*2→128) → ReLU → Dropout(dropout*0.5) → Linear(128→num_classes)

    Input:  (B, C, T, H, W)  —  (batch, 3, 16, 224, 224)
    Output: (B, 3)            —  logits for [Fight, Robbery, Accident]
    """
    try:
        import timm
    except ImportError as exc:
        raise ImportError(
            "The anomaly classifier requires the 'timm' package. "
            "Install it with: pip install timm"
        ) from exc

    backbone = timm.create_model(
        'efficientnet_b0',
        pretrained=False,   # weights come from the saved .pth checkpoint
        num_classes=0,
        global_pool='avg',
    )

    class EfficientGRU(nn.Module):
        def __init__(self):
            super().__init__()
            self.backbone = backbone
            self.feat_dim = 1280

            # Projection — matches training: Linear → LayerNorm → ReLU → Dropout(dropout*0.5)
            self.proj = nn.Sequential(
                nn.Linear(self.feat_dim, 512),
                nn.LayerNorm(512),
                nn.ReLU(inplace=True),
                nn.Dropout(dropout * 0.5),
            )

            # Bidirectional GRU — inter-layer dropout only when num_layers > 1
            self.gru = nn.GRU(
                input_size=512,
                hidden_size=gru_hidden,
                num_layers=gru_layers,
                batch_first=True,
                bidirectional=True,
                dropout=dropout if gru_layers > 1 else 0.0,
            )

            # Attention pooling over time steps
            self.attn = nn.Linear(gru_hidden * 2, 1)

            # 3-class classifier head
            self.head = nn.Sequential(
                nn.Dropout(dropout),
                nn.Linear(gru_hidden * 2, 128),
                nn.ReLU(inplace=True),
                nn.Dropout(dropout * 0.5),
                nn.Linear(128, num_classes),   # logits: [Fight, Robbery, Accident]
            )

        def forward(self, x):
            # x: (B, C, T, H, W)
            B, C, T, H, W = x.shape

            x_flat = x.permute(0, 2, 1, 3, 4).contiguous().view(B * T, C, H, W)
            feat   = self.backbone(x_flat)      # (B*T, 1280)
            feat   = self.proj(feat)            # (B*T, 512)
            feat   = feat.view(B, T, 512)       # (B, T, 512)

            gru_out, _ = self.gru(feat)         # (B, T, gru_hidden*2)

            attn_w = torch.softmax(self.attn(gru_out), dim=1)  # (B, T, 1)
            ctx    = (attn_w * gru_out).sum(dim=1)             # (B, gru_hidden*2)

            return self.head(ctx)               # (B, num_classes)

    return EfficientGRU()
