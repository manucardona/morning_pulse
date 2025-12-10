import json

import pandas as pd

import sys
from pathlib import Path

# Path to this file: .../CAPP30239/morning_pulse/cleaning/build_explore_data.py
HERE = Path(__file__).resolve()

# Go up two levels: .../CAPP30239
CAPP30239_ROOT = HERE.parents[2]

# Point to the src folder of capp30239_project
DATA_PROC_SRC = CAPP30239_ROOT / "capp30239_project" / "src"

TOPICS_PARQUET = HERE.parent / "derived" / "article_topics_bertopic.parquet"
TOPIC_INFO_CSV = HERE.parent / "derived" / "bertopic_topic_info.csv"

# Add that src folder to the Python path
sys.path.append(str(DATA_PROC_SRC))

from data_processing import *

# TOPIC KEYWORDS
# Latest version of Topic modeling uses BERTopic, but we keep these keywords
# for reference and possible future use.
TOPIC_KEYWORDS = {
    "Educación": [
        "escuela", "escuelas", "maestro", "maestros", "profesor", "profesores",
        "educacion", "educativo", "educativa", "estudiante", "estudiantes",
        "alumno", "alumnos", "universidad", "universidades", "colegio", "colegios",
        "campus", "beca", "becas", "formacion", "ensenanza", "aprendizaje",
        "docente", "docentes", "conalep", "tecnologico", "ipn", "unam", "politecnico"
    ],
    
    "Migración": [
        "migrante", "migrantes", "migracion", "inmigrante", "inmigrantes",
        "frontera", "fronteras", "caravana", "caravanas", "asilo", "refugio",
        "refugiado", "refugiados", "deportacion", "deportado", "regularizacion",
        "estados unidos", "eeuu", "ee uu", "mexico-estados unidos", "cruce", "cruzar",
        "movilidad humana", "centroamerica", "venezolano", "haitiano"
    ],
    
    "Pobreza": [
        "pobreza", "pobre", "pobres", "desigualdad", "marginalidad", "carencia",
        "ingreso", "ingresos", "salario", "salarios", "empleo", "trabajo", "trabajadores",
        "bienestar", "ayuda", "ayudas", "subsidio", "subsidios", "transferencia", "transferencias",
        "programa social", "programas sociales", "prospera", "oportunidades",
        "pensiones", "pension", "adultos mayores", "familias", "hogares", "comunidad",
        "economia popular"
    ],
    
    "Salud": [
        "salud", "hospital", "hospitales", "clinica", "clinicas", "centro de salud",
        "imss", "issste", "insabi", "medico", "medicos", "doctor", "doctora",
        "enfermero", "enfermera", "enfermeras", "vacuna", "vacunas", "covid", "covid19",
        "pandemia", "enfermedad", "enfermedades", "atencion medica", "servicios medicos",
        "salubridad", "medicamento", "medicamentos", "prevencion", "campana de vacunacion"
    ],
    
    "Seguridad": [
        "seguridad", "violencia", "delincuencia", "delincuente", "delito", "delitos",
        "crimen", "criminal", "criminales", "policia", "policias", "guardia nacional",
        "gn", "ejercito", "militar", "militares", "marina", "sedena", "defensa", "homicidio",
        "feminicidio", "narco", "narcotrafico", "cartel", "carteles", "armas", "combate",
        "operativo", "detencion", "captura", "seguridad publica"
    ],
    
    "Medio Ambiente": [
        "medio ambiente", "ambiente", "ecologia", "ecologico", "sustentable", "sostenible",
        "agua", "rio", "rios", "laguna", "lagunas", "bosque", "bosques", "selva", "selvas",
        "deforestacion", "reforestacion", "energia", "energias", "renovable", "solar", "eolica",
        "clima", "climatico", "cambio climatico", "contaminacion", "reciclaje", "naturaleza",
        "biodiversidad", "animales", "flora", "fauna", "aire limpio", "medioambiental"
    ]
}

# MAIN BUILD FUNCTION
def build_explore_data(raw_json_path: str, output_path: str):
    """
    Read raw presidencia JSON and export a compact explore_data.json for D3.
    """

    raw_json_path = Path(raw_json_path)
    output_path = Path(output_path)

    print(f"Loading raw data from {raw_json_path}...")
    raw_data = json.loads(raw_json_path.read_text(encoding="utf-8"))

    # Step 1. Flatten to a transcript-level DataFrame
    # Using pre processing functions from static project
    df = flatten_data(raw_data)  # uses parse_spanish_date internally
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date", "text"]).reset_index(drop=True)

    # Metadata per (date, title, url)
    meta = (
        df.groupby(["date", "title", "url"], as_index=False)
        .size()
        .rename(columns={"size": "n_paragraphs"})
    )

    # One conference per date
    unique_dates = sorted(df["date"].dt.date.unique())
    total_confs = len(unique_dates)
    print(f"Found {total_confs} unique dates.")

    # Step 2. Daily total words (length_words)
    df_words = df.copy()
    df_words["n_words"] = df_words["text"].fillna("").str.split().str.len()
    daily_lengths = (
        df_words.groupby("date", as_index=False)["n_words"]
        .sum()
        .rename(columns={"n_words": "length_words"})
    )

    # Step 3. Turn-taking stats (after first journalist start talking)
    turn_stats = get_turn_taking_stats_interact(df)
    turn_stats["date"] = pd.to_datetime(turn_stats["date"], errors="coerce")

    # Step 4. Words by role (President/Official vs Journalist)
    df_roles = df.copy()
    df_roles["speaker_clean"] = df_roles["speaker"].apply(clean_speaker)
    df_roles["speaker_group"] = df_roles["speaker_clean"].apply(
        lambda s: "Journalist" if s == "PERIODISTA/PREGUNTA" else "President/Official"
    )
    df_roles["words"] = df_roles["text"].fillna("").str.split().str.len()
    words_by_role = (
        df_roles.groupby(["date", "speaker_group"], as_index=False)["words"].sum()
    )

    # Step 5. Topic trends weekly
    # Note: latest topic modeling uses BERTopic, but we keep this for reference
    topic_trends_weekly = get_topics_by_week(df, TOPIC_KEYWORDS)
    topic_trends_records = [
        {
            "yearweek": str(row["yearweek"]),
            "topic": str(row["topic"]),
            "share_smooth": float(row["share_smooth"])
            if pd.notna(row["share_smooth"])
            else None,
        }
        for _, row in topic_trends_weekly.iterrows()
    ]

        # --- Load BERTopic outputs ---
    print("Loading BERTopic topic assignments...")
    topics_df = pd.read_parquet(TOPICS_PARQUET)
    topic_info = pd.read_csv(TOPIC_INFO_CSV)

    # Ensure date alignment
    topics_df["date"] = pd.to_datetime(topics_df["date"], errors="coerce")
    topics_df = topics_df.dropna(subset=["date", "topic_id"])

    topic_id_col = "Topic" if "Topic" in topic_info.columns else "topic_id"

    # Make a handy lookup: topic_id -> label (Name or joined keywords)
    if "Name" in topic_info.columns:
        topic_info["label"] = topic_info["Name"]
    else:
        # Use the first few words in "Representation" to make more intuitive labels
        if "Representation" in topic_info.columns:
            topic_info["label"] = topic_info["Representation"].astype(str)
        else:
            topic_info["label"] = topic_info[topic_id_col].astype(str)

    topic_label_map = dict(zip(topic_info[topic_id_col], topic_info["label"]))

    # Step 7. Build conference-level objects
    conferences = []

    for i, date_obj in enumerate(unique_dates, start=1):
        print(f"[{i}/{total_confs}] Processing conference for date {date_obj}...")
        date_ts = pd.Timestamp(date_obj)

        topics_day = topics_df[topics_df["date"].dt.date == date_obj].copy()

        # Drop outliers topic -1 if present
        if "topic_id" in topics_day.columns:
            topics_day = topics_day[topics_day["topic_id"] != -1]

        if not topics_day.empty:
            topic_counts = (
                topics_day
                .groupby("topic_id")
                .agg(
                    n=("topic_id", "size"),
                    avg_prob=("topic_prob", "mean") if "topic_prob" in topics_day.columns else ("topic_id", "size")
                )
                .reset_index()
            )

            total_n = topic_counts["n"].sum()
            topic_counts["share"] = topic_counts["n"] / total_n

            # Sort by frequency and keep top 5
            topic_counts = topic_counts.sort_values("n", ascending=False).head(5)

            topics_list = []
            for _, row in topic_counts.iterrows():
                tid = int(row["topic_id"])
                label = topic_label_map.get(tid, f"Topic {tid}")
                topics_list.append({
                    "topic_id": tid,
                    "label": label,
                    "count": int(row["n"]),
                    "share": float(row["share"]),
                    "avg_prob": float(row["avg_prob"]) if "avg_prob" in row and pd.notna(row["avg_prob"]) else None,
                })
        else:
            topics_list = []

        # metadata
        meta_rows = meta[meta["date"] == date_ts]
        if meta_rows.empty:
            title = ""
            url = ""
        else:
            first_row = meta_rows.iloc[0]
            title = first_row["title"]
            url = first_row["url"]

        # length_words
        len_row = daily_lengths[daily_lengths["date"] == date_ts]
        length_words = int(len_row["length_words"].iloc[0]) if not len_row.empty else 0

        # weekday
        weekday = date_ts.day_name()

        # turn-taking
        tt_row = turn_stats[turn_stats["date"] == date_ts]
        if not tt_row.empty:
            tt_row = tt_row.iloc[0]
            turn_taking = {
                "total_turns": int(tt_row["total_turns"]),
                "president_turns": int(tt_row["president_turns"]),
                "journalist_turns": int(tt_row["journalist_turns"]),
                "ratio_president_journalist": float(tt_row["ratio_president_journalist"]),
            }
        else:
            turn_taking = {
                "total_turns": 0,
                "president_turns": 0,
                "journalist_turns": 0,
                "ratio_president_journalist": None,
            }

        # sentiment series
        try:
            sent_df = compute_sentiment_for_date(
                df,
                target_date=str(date_ts.date()),
                text_col="text",
                date_col="date",
                after_first_journalist=True,
            )
        except RuntimeError as e:
            print(f"[WARN] Sentiment analyzer unavailable, skipping sentiment for {date_obj}: {e}")
            sent_df = pd.DataFrame()

        if not sent_df.empty:
            sent_df = sent_df.sort_values("intervention_order")

            sent_df["sentiment_smooth"] = (
                sent_df.groupby("role_group")["sentiment_score"]
                       .transform(lambda s: s.rolling(window=3, min_periods=1, center=True).mean())
            )

            sentiment_series = [
                {
                    "order": int(row["intervention_order"]),
                    "role_group": str(row["role_group"]),
                    "sentiment_score": float(row["sentiment_score"]),
                    "sentiment_smooth": float(row["sentiment_smooth"]),
                    "sentiment_label": str(row["sentiment_label"]),
                }
                for _, row in sent_df.iterrows()
            ]
        else:
            sentiment_series = []

        # words_by_role
        role_rows = words_by_role[words_by_role["date"] == date_ts]
        words_by_role_list = [
            {
                "speaker_group": str(r["speaker_group"]),
                "words": int(r["words"]),
            }
            for _, r in role_rows.iterrows()
        ]

        # states_mentioned (per date)
        sub_df = df[df["date"] == date_ts]
        state_counts = count_state_mentions(sub_df)
        state_counts = state_counts[state_counts["mentions"] > 0]
        states_mentioned = [
            {"state": str(r["state"]), "mentions": int(r["mentions"])}
            for _, r in state_counts.head(10).iterrows()
        ]

        conf_obj = {
            "id": str(date_obj),
            "date": str(date_obj),
            "title": title,
            "url": url,
            "weekday": weekday,
            "length_words": length_words,
            "turn_taking": turn_taking,
            "sentiment_series": sentiment_series,
            "words_by_role": words_by_role_list,
            "states_mentioned": states_mentioned,
            "topics": topics_list 
        }

        conferences.append(conf_obj)

    # Step 7. Final combined object
    explore_payload = {
        "conferences": conferences,
        "topic_trends_weekly": topic_trends_records,
    }

    # Step 8. Write JSON
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(explore_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Wrote {len(conferences)} conferences to {output_path}")


if __name__ == "__main__":
    HERE = Path(__file__).resolve()

    # CAPP30239 root
    ROOT = HERE.parents[2]

    INPUT  = ROOT / "capp30239_project" / "data" / "processed" / "article_transcripts.json"
    OUTPUT = ROOT / "morning_pulse" / "www" / "data" / "explore_data.json"

    build_explore_data(INPUT, OUTPUT)

