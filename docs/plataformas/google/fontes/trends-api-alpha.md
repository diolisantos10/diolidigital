---
titulo: "Google Trends API (alpha) — anúncio oficial e lista de espera"
url: https://developers.google.com/search/blog/2025/07/trends-api
capturado_em: 2026-08-08
hash: aea94e9accebb6a6
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.
>
> **CAPTURA MANUAL**, fora da rotina `capturar.mjs` — a entrada não estava no
> manifesto `fontes.json` do Google. Entrou porque o CEO pediu Google Trends em
> 08/08/2026 e a casa não tinha uma linha oficial sobre o estado da API.

Introducing the Google Trends API (alpha): a new way to access Search Trends data

    

  
      
    

  

  

  

  

  
    
  

  
    
    
  

Thursday, July 24, 2025

We're excited to let you know that the 
Google Trends API is here
! Google
Trends has been around for a long time, and the website has been the main way to access the data. Over the
  last years we've seen an increase in usage, and we received numerous requests for an API which wasn't
  available until today!

The API will be available only to a very limited number of testers. If you're interested in testing,
  
apply to be an alpha tester
.

While Trends data is available through the 
Trends website
,
the API provides new ways to use the data inside your organization in a scalable way. Based on early UX research,
  here are some use cases we've heard:

  

Research
: Developers can influence public resources allocation and scientific research priorities.

  

Publishers
: Use data to track topics and spot emerging trends, and use that data to tell compelling stories about the issues that matter.

  

Business
: Marketers and SEOs can prioritize resource investment and better develop their business' content strategy.

Data available

The API will provide consistently scaled search interest data, going back 1800 days (5 years), including daily,
  weekly, monthly, and yearly aggregations; it'll also offer geo restriction (region and sub-region).
  
That's a mouthful!
 In the following sections we'll provide more details about each of the API attributes.

Consistently scaled data

On the Trends website, the results are scaled from 0 to 100 every time you request data. The API uses a different
  method for scaling which is consistent across requests, and lets you join, compare, and merge data from multiple requests.
  However, while the API returns consistently scaled data, the numbers don't reflect absolute numbers, they
  reflect 
search interest
.

The advantage of this approach is that it enables developers to compare search interest between different requests.
  For example, if you monitor specific terms over time, with the API you can pull data only for the last period;
  in the Trends website you'd have to pull the entire period in every request, since each Trends website request
  scales the data between 0 to 100. Using consistently scaled data also makes it easier to compare between dozens
  of terms, while the Trends website offers only comparisons of 5 terms.

Time range and aggregations

Based on our analysis, most people keep their analyses within 5 years. For that reason, we decided to limit
  the data to a rolling window of 1800 days (~5 years). While a lot of Trends usage is around the last 12 months,
  we believe 5 years is important for researchers and journalists to look back at important moments such as
  previous elections (usually every 4 years) and sport events (for example, Olympics, World Cup). The data goes
  all the way up to just 2 days ago.

When it comes to date aggregation, we'll provide daily, weekly, monthly, and yearly aggregations. Since the use
  cases are diverse, and developers might want to merge the data with other reports, we're offering all four
  options to give more flexibility for developers to pull, manipulate, and merge Trends data with their own systems.

Geographical data

  The API will offer region and subregion breakdowns, as defined in the 
ISO 3166-2 standard
.

Alpha test

We'll start testing the product to understand usage and polish the final product, so we need feedback from
  developers who like testing and iterating with tools that might not be production-ready. If you fit into
  this profile, apply for the early access to the Google Trends API alpha.

We'll start opening access on a rolling basis to a limited number of developers over the coming weeks. If you're
  not in the first batch of developers, don't worry, we'll ramp up access in the coming months.

Apply to be an alpha tester

Posted by 
Daniel Waisberg
 and
  
Hadas Jacobi
, Google Trends team

  
  
  
  

  
    

  

  
    
    
      
    

    

  
       
         

  

  
    
    Send feedback
