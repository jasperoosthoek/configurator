import { AuthenticationContext } from '@elfsquad/authentication';
import { Configuration } from '../models/Configuration';
import { ConfigurationModels } from '../models/ConfigurationModels';
import { Layout3d } from '../models/Layout3d';
import {QuotationRequest} from '../models/QuotationRequest';
import { Settings } from '../models/Settings';
import { AuthenticationMethod, IConfiguratorOptions } from './IConfiguratorOptions';


export class ConfiguratorContext extends EventTarget {
    public authenticationContext: AuthenticationContext;
    public configurations: Configuration[] = [];

    constructor(public _options: IConfiguratorOptions) { 
        super();
        if (!_options.authenticationMethod){
            _options.authenticationMethod = AuthenticationMethod.ANONYMOUS;
        }

        if ((_options.authenticationMethod == AuthenticationMethod.ANONYMOUS || _options.authenticationMethod == AuthenticationMethod.ANONYMOUS_AND_USER_LOGIN)
            && !_options.tenantId){
            console.error('TenantId is required when the authentication method is ANONYMOUS.');
            return;
        }

        if (_options.authenticationMethod != AuthenticationMethod.ANONYMOUS && !_options.authenticationOptions){
            console.error('Authentication options are required if the authentication method is not set to ANONYMOUS.');
            return;
        }

        if (_options.authenticationMethod != AuthenticationMethod.ANONYMOUS){
            this.authenticationContext = new AuthenticationContext(_options.authenticationOptions);
        }

        if (!_options.apiUrl){
            _options.apiUrl = `https://api.elfsquad.io`;
        }
    }

    public async getConfigurationModels(languageIso?: string | undefined): Promise<ConfigurationModels> {
        let url = `${this._options.apiUrl}/configurator/1/configurator/configurationmodels`;
        if (languageIso){
            url += `?lang=${languageIso}`;
        }

        let result = await this._get(url);
        return (await result.json()) as ConfigurationModels;
    }

    public async newConfiguration(name: string, language: string = null, preview: boolean = false, includeSearchbarResults: boolean = false): Promise<Configuration> {
        let parameters = new URLSearchParams({ 
            language, 
            preview: preview?.toString(), 
            includeSearchbarResults: includeSearchbarResults?.toString()
        }).toString();
        let result = await this._get(`${this._options.apiUrl}/configurator/1/configurator/new/${name}?${parameters}`);
        
        const configuration = new Configuration(this, await result.json());
        this.configurations.push(configuration);
        await this._updateConfiguration(configuration);        
        
        return configuration;
    }

    public async openConfiguration(configurationId: string, includeSearchbarResults: boolean = false) : Promise<Configuration>{
        let result = await this._get(`${this._options.apiUrl}/configurator/1/configurator/open/${configurationId}?includeSearchbarResults=${includeSearchbarResults}`);
        
        const configuration = new Configuration(this, await result.json());
        this.configurations.push(configuration);
        await this._updateConfiguration(configuration);        
        
        return configuration;
    }

  

    public async getSettings(language: string = null): Promise<Settings> {
        if (language == null) language = this.rootConfiguration()?.language;
        let url = `${this._options.apiUrl}/configurator/1/configurator/settings`;
        if (language) url += `?lang=${language}`;
        let result = await this._get(url);
        return await result.json() as Settings;
    }

    public async getLayout3d(): Promise<Layout3d>{
        let result = await this._get(`${this._options.apiUrl}/configurator/1/configurator/${this.rootConfiguration().id}/3dlayout`);
        return await result.json() as Layout3d;
    }
    
    public onUpdate(f: (evt: CustomEvent<Configuration>) => void) {
        this.addEventListener('onConfigurationUpdated', f as (evt: CustomEvent<Configuration>) => void)
    }

    public async requestQuote(quotationRequest: QuotationRequest) {
      await this.post(`${this._options.apiUrl}/api/2/configurations/${this.rootConfiguration().id}/requestQuote`, quotationRequest);
    }

    public _get(url:string): Promise<Response> {
        return this.fetchRequest(new Request(url));
    }

    private rootConfiguration(): Configuration{
        if (this.configurations.length == 0) return null;
        return this.configurations[0];
    }

    private post(url: string, body: any): Promise<Response> {
        return this.fetchRequest(new Request(url, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
                'Content-Type': 'application/json'
            }
        }));
    }

    public _put(url:string, object: any): Promise<Response> {
        return this.fetchRequest(new Request(url, {
            method: 'PUT',
            headers:  { 'Content-Type': 'application/json' },
            body: JSON.stringify(object)
        }));
    }

    private async fetchRequest(input: Request): Promise<Response> {
        if (await this.useElfsquadIdHeader()) {
            input.headers.append('x-elfsquad-id', this._options.tenantId);
        }
        else {
            input.headers.append('authorization', `Bearer ${await this.authenticationContext.getAccessToken()}`);
        }

        return fetch(input);
    }

    private async useElfsquadIdHeader(): Promise<boolean> {
        if (this._options.authenticationMethod == AuthenticationMethod.ANONYMOUS){
            return true;
        }

        if (this._options.authenticationMethod == AuthenticationMethod.USER_LOGIN){
            return false;
        }

        if (this._options.authenticationMethod == AuthenticationMethod.ANONYMOUS_AND_USER_LOGIN){
            return !(await this.authenticationContext.isSignedIn());
        }
    }

    public async _updateConfiguration(configuration: Configuration) {
        this.dispatchEvent(new CustomEvent<Configuration>('onConfigurationUpdated', {'detail': configuration}));
    }
}
