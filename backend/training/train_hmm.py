import pandas as pd
import joblib
from hmmlearn import hmm
import numpy as np

df = pd.read_csv("../dataset/uk_dale.csv")

data = df["aggregate"].values.reshape(-1, 1)

model = hmm.GaussianHMM(n_components=2)
model.fit(data)

joblib.dump(model, "../models/hmm_model.pkl")
print("HMM model saved.")
