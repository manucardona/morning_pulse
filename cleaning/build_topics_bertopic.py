"""
build_topics_bertopic.py

Run BERTopic on Presidencia transcripts to assign a topic to each intervention.

Location:
    /Users/jmcarias/Documents/CAPP30239/morning_pulse/cleaning/build_topics_bertopic.py

Created using GPT-4 on 2025-12-07:
Write a complete Python script that runs BERTopic on a JSON file of Presidencia transcripts.
The script should:
- Import BERTopic, SentenceTransformer, pandas, and standard libraries.
- Load transcript data from capp30239_project/data/processed/article_transcripts.json.
- Use helper functions parse_spanish_date and clean_text from a data_processing.py module located in capp30239_project/src.
- Flatten the JSON into one row per intervention (date, title, url, speaker, text).
- Clean and filter the data (drop invalid dates and very short texts).
- Add a clean_text column, but do not remove stopwords.
- Fit BERTopic on interventions using the multilingual MiniLM model paraphrase-multilingual-MiniLM-L12-v2.
- Then transform the entire dataset and assign:
    - topic_id
    - topic_prob (max prob for each doc)
- Save outputs into a derived directory.
"""

import os
import json
import sys
from pathlib import Path

import pandas as pd
from bertopic import BERTopic
from sentence_transformers import SentenceTransformer

# Avoid the HuggingFace tokenizers parallelism warning
os.environ["TOKENIZERS_PARALLELISM"] = "false"

# ---------------------------------------------------------------------
# Path configuration
# ---------------------------------------------------------------------
HERE = Path(__file__).resolve()

# Repo root = /Users/jmcarias/Documents/CAPP30239
ROOT = HERE.parents[2]

# Point to your processing code folder:
DATA_PROC_SRC = ROOT / "capp30239_project" / "src"
sys.path.append(str(DATA_PROC_SRC))

# Import helpers from data_processing.py
from data_processing import parse_spanish_date, clean_text  # type: ignore

# Input transcripts file:
INPUT_JSON = ROOT / "capp30239_project" / "data" / "processed" / "article_transcripts.json"

# Output location for BERTopic results:
OUT_DIR = HERE.parent / "derived"
OUT_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------
# Main BERTopic builder
# ---------------------------------------------------------------------
def main():
    print(f"Loading raw transcript data from: {INPUT_JSON}")
    raw = json.loads(INPUT_JSON.read_text(encoding="utf-8"))

    n_articles = len(raw)
    print(f"Found {n_articles} articles/conferences.")

    # 1. Flatten raw JSON -> one row per intervention/paragraph
    rows = []

    for i, article in enumerate(raw, start=1):
        # Single progress print per article
        print(f"[{i}/{n_articles}] Processing article: {article.get('title', '')[:80]}")
        raw_date = article.get("date")
        parsed_date = parse_spanish_date(raw_date)

        for t in article.get("transcript", []):
            rows.append(
                {
                    "date": parsed_date,
                    "title": article.get("title"),
                    "url": article.get("url"),
                    "speaker": t.get("speaker"),
                    "text": t.get("text"),
                }
            )

    df = pd.DataFrame(rows)
    print(f"Flattened to {len(df)} rows (interventions).")

    # 2. Basic cleaning
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date", "text"]).reset_index(drop=True)

    # Remove ultra-short fragments (optional, e.g. fewer than 5 words)
    before_short = len(df)
    df = df[df["text"].str.split().str.len().fillna(0) >= 5].reset_index(drop=True)
    print(f"After dropping very short fragments: {before_short - len(df)} removed, {len(df)} remain.")

    # 3. Clean text for modeling (keep stopwords so BERTopic sees full sentences)
    print("Cleaning text...")
    df["clean_text"] = df["text"].apply(
        lambda t: clean_text(t, remove_stopwords=False)
    )

    # ----------------------------
    # 1) SAMPLE for topic discovery
    # ----------------------------
    N_SAMPLE = 20000  # adjust if you want smaller/bigger
    if len(df) > N_SAMPLE:
        df_sample = df.sample(n=N_SAMPLE, random_state=42)
    else:
        df_sample = df.copy()

    print(f"Using {len(df_sample)} docs to FIT BERTopic (sample).")

    docs_sample = df_sample["clean_text"].tolist()
    docs_all = df["clean_text"].tolist()

    # 4. Embedding model (multilingual, good for Spanish)
    print("Loading sentence-transformer model (paraphrase-multilingual-MiniLM-L12-v2)...")
    embedding_model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

    # Encode only the sample for fitting
    print("Encoding sample documents for BERTopic...")
    emb_sample = embedding_model.encode(docs_sample, show_progress_bar=True)

    # 5. BERTopic model
    topic_model = BERTopic(
        language="multilingual",
        embedding_model=embedding_model,
        calculate_probabilities=True,
        verbose=True,  # BERTopic will log its own progress
    )

    print("Fitting BERTopic on sample...")
    topics_sample, probs_sample = topic_model.fit_transform(docs_sample, emb_sample)
    print(f"BERTopic fit complete on sample. Found {len(set(topics_sample))} topics.")

    # ----------------------------
    # 2) TRANSFORM full dataset
    # ----------------------------
    print("Assigning topics to ALL interventions (transform)...")
    topics_all, probs_all = topic_model.transform(docs_all)
    
    df["topic_id"] = topics_all

    # probs_all is (n_docs, n_topics) → keep the max prob per doc
    if probs_all is not None:
        df["topic_prob"] = probs_all.max(axis=1)
    else:
        df["topic_prob"] = None


    # 6. Save per-intervention topic assignments
    topics_path = OUT_DIR / "article_topics_bertopic.parquet"
    df.to_parquet(topics_path, index=False)
    print(f"Saved per-intervention topics to: {topics_path}")

    # 7. Save topic summaries
    topic_info = topic_model.get_topic_info()
    info_path = OUT_DIR / "bertopic_topic_info.csv"
    topic_info.to_csv(info_path, index=False)
    print(f"Saved topic info to: {info_path}")

    # 8. Save full BERTopic model
    model_path = OUT_DIR / "bertopic_model"
    topic_model.save(model_path)
    print(f"Saved BERTopic model to: {model_path}")

    print("Done. BERTopic topics built successfully.")


# ---------------------------------------------------------------------
if __name__ == "__main__":
    main()
