"""Configuration preflight; --live sends only an embedded synthetic sentence."""
import argparse
from .config import settings, validate_ai_config
from .nlp.providers import AzureCustomNer, ProviderError
from .nlp.azure_llm import AzureLlm


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live',action='store_true',help='Use prediction quota for a synthetic text; does not upload a CV')
    args=parser.parse_args()
    validate_ai_config(settings)
    if settings.ai_provider not in ('azure_custom_ner','azure_llm'):
        raise SystemExit('Azure is OFF. Configure a provider and set AI_PROVIDER=azure_llm or azure_custom_ner first.')
    print('Configuration valid. Key is not displayed.')
    if settings.ai_provider=='azure_llm':
        print('Provider: Azure LLM; Deployment:',settings.azure_openai_deployment)
        client=AzureLlm(settings)
    else:
        print('Project:',settings.azure_ner_project,'Deployment:',settings.azure_ner_deployment,'Release:',settings.azure_ner_model_version)
        client=AzureCustomNer(settings)
    if not args.live:
        print('No network request made. Pass --live to test synthetic text.')
        return
    try:
        entities,version=client.extract('Ukazkovy text. Skills: Python, SQL, Docker.')
    except ProviderError as exc:
        raise SystemExit(str(exc))
    print('Azure responded. Model:',version,'Skills:',', '.join(sorted({e.skill for e in entities})) or '(none; review training)')
    if settings.ai_provider=='azure_llm':
        print('Usage:',client.metadata.get('usage',{}))


if __name__=='__main__': main()
